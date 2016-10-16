"use strict"

const ramda = require("ramda");
const NUM_SYNC_ARGS = 1;
const NUM_ASYNC_ARGS = 2;
const NOT_FOUND = -1;

function makePipe(parentCurryFs = [], parentPipeFs = []){

   const o = {}
   const p = makeProxy(o)
   const tags = {maybe: maybe, parallel: parallel, which: which}
   const pipeFs = parentPipeFs

   let curryFs = parentCurryFs
   let input = null

   makeMethods(curryFs)
   makeTagMethods(tags)

   o.exec = (initValue, cb) => {

      let g = compose(initValue)
      iterate()

      function iterate(oldVal){
         let {value, done} = g.next(oldVal)
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

   o.in = function(value){
      input = value
      return p
   }

   o.out = function(cb){
      o.exec(input, cb)
      return p
   }

   o.funcize = function(methodName){
      const f = function(){
         return function (arg, cb){
            o.exec(arg, cb)
         }
      }
      f._name = methodName;
      return f;
   }

   o.methodize = function(...newCurryFs){
      curryFs = curryFs.concat(newCurryFs)
      makeMethods(newCurryFs)
      return p
   }

   o.validate = function(){
      validateFs(newCurryFs)
   }

   o.getCurryFs = function(){
      return curryFs
   }

   o.mixin = function(...pipes){
      pipes.forEach((pipe) => {
         makeMethods(pipe.getCurryFs())
      })
      return p
   }

   o.clone = function(){
      return makePipe(curryFs.slice(), pipeFs.slice())
   }

   o.clear = function(name){
      pipeFs.length = 0
      return p
   }

   o.tagize = function(tags){
      let tagFuncs = makeTagFs(tags);
      curryFs = curryFs.concat(tagFuncs)
      makeMethods(tagFuncs)
      return p
   }

   o.c = function(f){
      pipeFs.push(f)
      return p
   }

   return p

   function makeProxy(o){
      return new Proxy(o, {
         get: function(target, prop){
            if(prop in o){
               return o[prop]
            } else if (prop in ramda){
               return function(...args){
                  pipeFs.push(ramda[prop].apply(null, args))
                  return p
               }
            } else {
               throw new Error("Method not added to pipe: " + prop)
            }
         }
      })
   }

   function makeMethods(curryFs){
      curryFs.forEach((f) => {
         f._name = f.name || f._name;
         o[f._name] = (...args) => {
            pipeFs.push(f.apply(null, args))
            return p;
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
      const funcs = applyTags(pipeFs)

      for (let i = 0; i < funcs.length; i++){
         let f = funcs[i];
         if (f.length === NUM_SYNC_ARGS) {
            value = yield f(value)
         } else if (f.length === NUM_ASYNC_ARGS) {
            value = yield makePromise(f, value)
         }
      }
      yield value
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

      let pipeFs = (one) => {}
      pipeFs._tag = tag;
      pipeFs._begin = isBegin

      let curryFs = (...params) => {
         if (isBegin){
            pipeFs._params = params
            pipeFs._replaceInnerFs = replaceInnerFs
         }
         return pipeFs
      }

      curryFs._name = methodStr
      return curryFs
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
}

module.exports = {
   makePipe: makePipe,
   r: ramda
}
