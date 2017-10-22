"use strict"

/*
HOW TO USE IT

makePipe makes a pipe. A pipe turns currying functions into chainable methods:
let pipe = makePipe()
pipe.methize(curryingFunction)
pipe.curryingFunction().otherCurryingFunction()

Those currying functions return composable functions when invoked.
Sync composable functions have one parameter (data).
Async composable functions have this signature (data, callback).
Callback signature: (err, data).

Chain in/out to get output:
pipe.in(input).doThis().doThat().out((err, output) => console.log(output))

Much, much more: https://www.npmjs.com/package/piperoni.

HOW IT WORKS

A pipe is created with arrays for currying functions (curryFs) and composable function (composeFs).
Currying functions added to the pipe (methize) are stored in (curryFs).
They are also wrapped in a function (makeMethods) before being added as a methods.
When called, the wrapper function calls the currying function and stores the returned function in (composeFs)...
..then returns a proxy for chaining.
Repeated invocations of chainable methods populate (composeFs).
When the pipe is executed (exec, in/out), a iterable (gen) is created by a generator (compose).
Compose is a typical functional compose, except async functions yield promises.
An async runner (iterable) resolves promises and iterates next until the generator quits...
...and a value is returned.

HOW IT WORKS: Cloning/State

When a pipe is cloned (clone) it passes its curryFs and composeFs into a new pipe (makePipe).
The only other state (input, set by "in") is not cloned.
(clear) zeroes out a (composeFs) and leaves curryFs alone to be called anew.
When composition begins (exec, in/out), further changes to input and composableFs cannot change its course.

HOW IT WORKS: Tag Functions

Tag functions are created by (tagize).
Tagize takes a tag name (parallel, which, maybe) and an associated replace function.
Right before composition, tag functions transform the functions to be composed.
The composition is mapped to nodes (makeNodes), which identify tag and non-tag functions
Tags without inner tags are identified by 1. finding the first stop-tag node and going backwards for a match (applyTags).
Tag nodes are removed and the inner nodes are passed into the tag's replace function (replaceNodes).
When all tags are parsed, nodes are mapped back to functions and composed.

HOW IT WORKS: Ramda
When a pipe's method invocation are chained, it returns a proxy (makeProxy) of itself.
When methods are invoked, the proxy looks for method names on the pipe.
If it finds them, it invokes them, otherwise it forwards the call to the Ramda library.
*/

const ramda = require("ramda");
const NUM_SYNC_ARGS = 1;
const NUM_ASYNC_ARGS = 2;
const NOT_FOUND = -1;

function makePipe(parentCurryFs = [], parentComposeFs = []){

   const pipe = {}
   const proxy = makeProxy(pipe)
   const tags = {maybe: maybe, parallel: parallel, which: which}
   const composeFs = parentComposeFs

   let curryFs = parentCurryFs
   let input = null

   makeMethods(curryFs)
   makeTagMethods(tags)

   pipe.methodize = function(...newCurryFs){
      curryFs = curryFs.concat(newCurryFs)
      makeMethods(newCurryFs)
      return proxy
   }

   pipe.tagize = function(tags){
      let tagFuncs = makeTagFs(tags)
      curryFs = curryFs.concat(tagFuncs)
      makeMethods(tagFuncs)
      return proxy
   }

   pipe.c = function(f){
      composeFs.push(f)
      return proxy
   }

   pipe.in = function(value){
      input = value
      return proxy
   }

   pipe.out = function(cb){
      pipe.exec(input, cb)
      return proxy
   }

   pipe.exec = (initValue, cb) => {

      let gen = compose(initValue)
      iterate()

      function iterate(oldVal){
         let {value, done} = gen.next(oldVal)
         if (done){
            return handle(null, oldVal)
         } else {
            if (value instanceof Promise){
               value.then((v) => {
                  iterate(v)
               }).catch((err) => {
                  return handle(err)
               })
            } else {
               iterate(value)
            }
         }
      }

      function handle (err, data){
         setImmediate(function(){
            cb(err, data)
         })
      }
   }

   pipe.mixin = function(...pipes){
      pipes.forEach((p) => {
         makeMethods(p.getCurryFs())
      })
      return proxy
   }

   pipe.clone = function(){
      return makePipe(curryFs.slice(), composeFs.slice())
   }

   pipe.clear = function(name){
      composeFs.length = 0
      return proxy
   }

   pipe.funcize = function(methodName){
      const f = function(){
         return function (arg, cb){
            pipe.exec(arg, cb)
         }
      }
      f._name = methodName;
      return f;
   }

   pipe.validate = function(){
      validateFs(newCurryFs)
   }

   pipe.getCurryFs = function(){
      return curryFs
   }

   return proxy

   function makeMethods(curryFs){
      curryFs.forEach((f) => {
         f._name = f.name || f._name;
         pipe[f._name] = (...args) => {
            composeFs.push(f.apply(null, args))
            return proxy;
         }
      })
   }

   function makeTagMethods(tags){
      let tagFuncs = makeTagFs(tags);
      curryFs = curryFs.concat(tagFuncs)
      makeMethods(tagFuncs)
   }

   function* compose(initValue){

      let value = initValue
      const funcs = applyTags(composeFs)

      for (let i = 0; i < funcs.length; i++){
         let f = funcs[i];
         if (f.length === NUM_SYNC_ARGS) {
            value = f(value)
         } else if (f.length === NUM_ASYNC_ARGS) {
            value = yield makePromise(f, value)
         }
      }
      yield value
   }

   function makeTagFs(tags){
      return Object.keys(tags).reduce((arr, baseName) => {
         let tag = baseName.toLowerCase()
         tag = tag[0].toUpperCase() + tag.slice(1)
         let startTag = "start" + tag
         let stopTag = "stop" + tag
         let replaceInnerFs = tags[baseName]
         arr.push(makeTagFunc(tag, startTag, true, replaceInnerFs))
         arr.push(makeTagFunc(tag, stopTag, false))
         return arr;
      }, [])
   }

   function makeTagFunc(tag, methodStr, isBegin, replaceInnerFs){

      let composeFunc = () => {}
      composeFunc._tag = tag;
      composeFunc._begin = isBegin

      let curryFunc = (...params) => {
         if (isBegin){
            composeFunc._params = params
            composeFunc._replaceInnerFs = replaceInnerFs
         }
         return composeFunc
      }

      curryFunc._name = methodStr
      return curryFunc
   }

   function applyTags(funcs){

      const nodes = makeNodes(funcs)
      let firstEndToken = getFirstEndToken()

      while (firstEndToken > NOT_FOUND){

         let stopNode = nodes[firstEndToken]
         let startNode = null;

         for (let i = firstEndToken - 1; i > -1; i--){
            let node = nodes[i]
            if (node.begin === true){
               if (node.tag === stopNode.tag){
                  startNode = node
                  break
               }
            }
         }

         if (startNode){
            replaceNodes(startNode.replaceInnerFs, startNode, stopNode, nodes)
            firstEndToken = getFirstEndToken()
         } else{
            throw Error("No begin tag for: " + stopNode.tag)
         }
      }

      return nodes.map((node) => {
         if (node.tag){
            throw new Error("Tag not parsed out: " + node.tag)
         }
         return node.func;
      })

      function getFirstEndToken(){
         return nodes.findIndex(node => node.begin === false)
      }
   }

   function makeNodes(funcs){
      return funcs.map((f, index) => {
         if (f._tag){
            return {
               func: f,
               begin: f._begin,
               tag: f._tag,
               params: f._params,
               replaceInnerFs: f._replaceInnerFs
            }
         } else {
            return {
               func: f,
               begin: null,
               tag: null,
               params: null,
               replaceInnerFs: null
            }
         }
      })
   }

   function replaceNodes(replaceInnerFs, startNode, stopNode, nodes){
      const start = nodes.indexOf(startNode)
      let stop = nodes.indexOf(stopNode)
      nodes.splice(start, 1)
      nodes.splice(--stop, 1)

      const innerNodes = nodes.splice(start, stop - start)
      const innerFuncs = innerNodes.map(node => node.func)
      const replaced = replaceInnerFs(innerFuncs, startNode.params)
      nodes.splice(start, 0, ...makeNodes(replaced))
   }

   function parallel(funcs, params){
      let func = (data, cb) => {
         let promises = funcs.map(f => {
            return makePromise(f, data)
         })
         Promise.all(promises).then(function(val){
            cb(null, val )
         }, function(err){
            cb(err)
         })
      }
      return [func]
   }

   function maybe(fs, params){
      const test = params.pop()
      return fs.map(f => {
         if (f.length === NUM_SYNC_ARGS){
            return data => {
               if (test(data)){
                  return f(data)
               } else {
                  return data
               }
            }
         } else if (f.length === NUM_ASYNC_ARGS){
            return (data, callback) => {
               if (test(data)){
                  f(data, callback)
               } else {
                  callback(null, data)
               }
            }
         }
      })
   }

   function which(fs, params){
      const pick = params.pop()
      const picked = (data, callback) => {
         const f = fs[pick(data)]
         if (f.length === NUM_SYNC_ARGS){
            callback(null, f(data))
         } else if (f.length === NUM_ASYNC_ARGS){
            f(data, callback)
         }
      }
      return [picked]
   }

   function makePromise(f, value){
      return new Promise((resolve, reject) => {
         f(value, (err, data) => {
            if (err){
               reject(err)
            } else {
               resolve(data)
            }
         })
      })
   }

   function validateFs(curryFs){
      curryFs.forEach((f) => {
         let pipeFunc = f()
         if (typeof pipeFunc !== "function"){
            throw new Error("To be methodize, a function needs to return a function " + f.toString())
         } else if (pipeFunc.length !== NUM_SYNC_ARGS && pipeFunc.length !== NUM_ASYNC_ARGS){
            throw new Error("To be methodize, a function needs to return a function with 1 (sync) or 2 (async) parameters " + f.toString())
         }
      })
   }

   function makeProxy(p){
      return new Proxy(p, {
         get: function(target, prop){
            if(prop in p){
               return p[prop]
            } else if (prop in ramda){
               return function(...args){
                  composeFs.push(ramda[prop].apply(null, args))
                  return proxy
               }
            } else {
               throw new Error("Method not added to pipe: " + prop)
            }
         }
      })
   }
}

module.exports = {
   makePipe: makePipe,
   r: ramda
}
