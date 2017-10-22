"use strict"

const Piperoni = require("../index.js")
const makePipe = Piperoni.makePipe
const assert = require("assert")
let pipe, pipe2

describe ("Pipe Methods", () => {

   it("Higher-order functions are converted to methods.", () => {
      pipe = makePipe()
      pipe.methodize(increment)
      assert(typeof pipe.increment === "function")
   })

   it("Only higher-order functions can be converted to methods.", () => {
      pipe = makePipe()
      assert.throws(function(){
         pipe.methodize(returnsOb)
         pipe.validate()
      })
   })

   it("Methods can be added only if they return a function with one (sync)or two (async) parameters.", () => {
      pipe = makePipe()
      assert.throws(function(){
         pipe.methodize(returns3PointFunc)
         pipe.validate()
      })
   })

   it("Methods can be mixed in from another pipe.", () => {
      pipe = makePipe()
      pipe.methodize(increment)
      pipe2 = makePipe()
      pipe2.mixin(pipe)
      assert(typeof pipe2.increment === "function")
   })

   it("Unrecognized methods cause an error.", () => {
      function noSuchMethod(){
         pipe = makePipe()
         pipe.foo
      }
      assert.throws(noSuchMethod, Error)
   })
})

describe ("Pipe Out", () => {

   it("Functions can be directly composed.", done => {
      pipe = makePipe()
      pipe.c(num => num + 10)
          .c(num => num * 10)
          .in(0)
          .out((err, data) => {
            assert(data === 100)
            done()
         })
   })

   it("Methods mixed in from another pipe work.", () => {
      pipe = makePipe()
      pipe.methodize(increment)
      pipe2 = makePipe()
      pipe2.mixin(pipe)
         .in(0)
         .increment(1)
         .out((err, data) => {
            assert(data === 1)
         })
   })

   it("Sync functions composed", () => {
      pipe = makePipe()
      pipe.methodize(increment)
          .in(0)
          .increment(1)
          .increment(1)
          .out((err, data) => {
             assert(data === 2)
          })
   })

   it("Async functions composed", done => {
      pipe = makePipe()
      pipe.methodize(waitAndIncrement)
          .in(0)
          .waitAndIncrement(1)
          .waitAndIncrement(1)
          .out((err, data) => {
             assert(data === 2)
             done()
          })
   })

   it("Async and sync functions composed together", done => {
      pipe = makePipe()
      pipe.methodize(increment, waitAndIncrement)
          .in(0)
          .increment(1)
          .waitAndIncrement(1)
          .out((err, data) => {
             assert(data === 2)
          })

       pipe2 = makePipe()
       pipe2.methodize(increment, waitAndIncrement)
       pipe2.in(0)
           .waitAndIncrement(1)
           .increment(1)
           .out((err, data) => {
              assert(data === 2)
              done()
           })
   })

   it("The 'in' method can be invoked anywhere before 'out'.", done => {
      pipe = makePipe()
      pipe.methodize(waitAndIncrement)
      pipe.waitAndIncrement(1)
          .waitAndIncrement(1)
          .in(0)
          .out((err, data) => {
             assert(data === 2)
             done()
          })
   })

   it("Pipe does not skip to callback when there is a sync error.", () => {
      function syncError(){
         pipe = makePipe()
         pipe.methodize(incrementErr, waitAndIncrement)
         pipe.in(0)
             .incrementErr(1)
             .waitAndIncrement(1)
             .out((err, data) => {
                assert(err)
             })
      }
      assert.throws(syncError, Error)
   })

   it("Pipe skips to callback when there is an async error.", done => {
      pipe = makePipe()
      pipe.methodize(increment, waitAndIncrementErr)
      pipe.in(0)
          .waitAndIncrementErr(1)
          .increment(1)
          .out((err, data) => {
             assert(err)
             done()
          })
   })
})

describe ("Pipe State", () => {

   it("Piped functions persist after out.", done => {
      pipe = makePipe()
      pipe.methodize(increment)
      pipe.in(0)
          .increment(1)//WILL PERSIST
          .out((err, data) => {
             pipe
               .in(0)
               .increment(1)
               .out((err, data) => {
                  assert(data === 2)
                  done()
               })

          })
   })

   it("Piped functions do not persist after clearing.", done => {
      pipe = makePipe()
      pipe.methodize(increment)
      pipe.in(0)
          .increment(1)
          .out((err, data) => {
             pipe
               .clear()
               .in(0)
               .increment(1)
               .out((err, data) => {
                  assert(data === 1)
                  done()
               })

          })
   })

   it("Pipe methods are copied by cloning.", () => {
      pipe = makePipe()
      pipe.methodize(increment)
      pipe2 = pipe.clone()
      assert(typeof pipe2.increment === "function")
   })

   it("Tag methods are copied by cloning.", () => {
      pipe = makePipe()
      pipe.methodize(increment)
      pipe.tagize({times: times})
      pipe2 = pipe.clone()
      assert(typeof pipe2.startTimes === "function")
   })

   it("Piped functions are copied by cloning.", (done) => {
      pipe = makePipe()
      pipe.methodize(increment)
      pipe.increment(1)
      pipe2 = pipe.clone()
      pipe2
         .in(0)
         .out((err, data) => {
            assert(data === 1)
            done()
         })
   })

   it("Originals and clones have no effect on each other.", (done) => {
      pipe = makePipe()
      pipe.methodize(increment)
      pipe.increment(1)//SHARED +1
      pipe2 = pipe.clone()
      pipe2
         .in(0)
         .increment(10)//DIVERGENT +1
         .out((err, data) => {
            assert(data === 11)
            pipe
               .increment(100)//DIVERGENT +10
               .in(0)
               .out((err, data) => {
                  assert(data === 101)
                  done()
               })
         })
   })

   it("Methods calls after out call do not effect out call", done => {

      pipe = makePipe()
      pipe.methodize(waitAndIncrement, increment)
      pipe.waitAndIncrement(1)
         .in(0)
         .out((err, data) => {
            assert(data === 1)
            done()
         })
         .increment(10000000000)
   })
})

describe ("Pipe Composition", () => {

   it("A pipe can be added as a method to another pipe.", done => {
         pipe = makePipe()
         pipe.methodize(increment)
             .increment(1)
         pipe2 = makePipe()
         pipe2.methodize(pipe.funcize("addOne"))
              .addOne()
              .in(0)
              .out((err, data) => {
                 assert(data === 1)
                 done()
              })
   })
})

describe ("Tags", () => {

   it("Parallel tags call inner functions in parallel.", done => {
      pipe = makePipe()
      pipe.methodize(waitAndIncrement)
          .startParallel()
          .waitAndIncrement(1)
          .waitAndIncrement(2)
          .stopParallel()
          .reduce((sum, inc) => sum + inc, 0)
          .in(0)
          .out((err,data) => {
             assert(data === 3)
            done()
          })
   })

   it("Which tags pick a sync inner function.", done => {
      pipe = makePipe()
          .methodize(increment)
          .startWhich(function pickSecond(){return 1})
          .increment(1)
          .increment(2)
          .increment(3)
          .stopWhich()
          .in(0)
          .out((err,data) => {
             assert(data === 2)
            done()
          })
   })

   it("Which tags pick an async inner function.", done => {
      pipe = makePipe()
          .methodize(waitAndIncrement)
          .startWhich(data => 1)
          .waitAndIncrement(1)
          .waitAndIncrement(2)
          .waitAndIncrement(3)
          .stopWhich()
          .in(0)
          .out((err,data) => {
             assert(data === 2)
            done()
          })
   })

   it("Maybe tags skip inner functions.", done => {
      pipe = makePipe()
          .methodize(increment)
          .startMaybe(data => data < 1)
          .increment(1)
          .stopMaybe()
          .in(1)
          .out((err,data) => {
             assert(data === 1 )
            done()
          })
   })

   it("Maybe tags don't skip inner functions.", done => {
      pipe = makePipe()
      pipe.methodize(increment)
          .startMaybe(data => data < 1)
          .increment(1)
          .stopMaybe()
          .in(0)
          .out((err,data) => {
             assert(data === 1)
            done()
          })
   })

   it("Maybe tags skip case (async).", done => {
      pipe = makePipe()
      pipe.methodize(waitAndIncrement)
          .startMaybe(data => data < 1)
          .waitAndIncrement(1)
          .stopMaybe()
          .in(1)
          .out((err,data) => {
             assert(data === 1)
            done()
          })
   })

   it("Maybe tags don't skip case (async).", done => {
      pipe = makePipe()
      pipe.methodize(waitAndIncrement)
          .startMaybe(data => data < 1)
          .waitAndIncrement(1)
          .stopMaybe()
          .in(0)
          .out((err, data) => {
             assert(data === 1 )
            done()
          })
   })

   it("Tags can be added to a pipe.", () => {
      pipe = makePipe()
      pipe.methodize(increment)
          .tagize({times: times})
          .startTimes(5)
          .increment(1)
          .stopTimes()
          .in(0)
          .out((err, data) => {
             assert(data === 5 )
         })
   })

   it("Tags can be siblings and children.", done => {
      pipe = makePipe()
      pipe.methodize(waitAndIncrement, increment)
          .tagize({times: times})
          .startParallel()
          .startTimes(5)
          .waitAndIncrement(1)
          .stopTimes()
          .stopParallel()
          .reduce((sum, inc) => sum + inc, 0)
          .startMaybe(sum => sum !== 5)
          .increment(1)
          .stopMaybe()
          .in(0)
          .out((err, data) => {
             assert(data === 5 )
             done()
           })
   })

   it("Missing start tags cause an error.", function(){
      function missingBeginTag(){
         pipe = makePipe()
         pipe.methodize(increment)
           .tagize({times: times})
           .increment(1)
           .stopTimes()
           .in(0)
           .out((err, data) => {
             assert(data === 5 )
         })
      }
      assert.throws(missingBeginTag, Error)
   })

   it("Unparsed tag functions cause an error.", () => {
      function leftOverTag(){
         pipe = makePipe()
         pipe.methodize(waitAndIncrement)
            .tagize({times: times})
            .startTimes(5)
            .waitAndIncrement(1)
            .in(0)
            .out((err, data) => {
               assert(data === 5 )
            })
      }
      assert.throws(leftOverTag, Error)
   })
})

describe ("Ramda Integration", () => {

   it("Piper exposes Ramda.", () => {
      const r = Piperoni.r;
      let arr = [1,2,3]
      arr = r.map(num => num + 1, arr)
      const sum = r.reduce((sum, inc) => sum + inc, 0, arr)
      assert(sum == 9)
   })

   it("Pipes expose ramda.", () => {
      pipe = makePipe()
      pipe.map(num => num + 1)
      pipe.reduce((sum, inc) => sum + inc, 0)
      pipe.in([1,2,3])
      pipe.out((err, data) => {
         assert(data === 9)
      })
   })
})

function add(x, y){
   return x + y
}

function increment(y){
   return function(x){
      return add(x, y)
   }
}

function incrementErr(y){
   return function(x){
      foo.bar//ERROR
   }
}

function waitAndIncrement(inc, time = 5){
   return function(x, callback){
      setTimeout(function(){
         callback(null, increment(inc)(x))
      }, time)
   }
}

function waitAndIncrementErr(inc){
   return function(x, callback){
      foo.bar//ERROR
      setTimeout(function(){
         callback(new Error("Something wrong"))
      }, 5)
   }
}

function waitAndIncrementAsyncErr(inc){
   return function(x, callback){
      setTimeout(function(){
         foo.bar //ERROR
         callback(new Error("Something wrong"))//THIS CASE NOT COVERED YET
      }, 5)
   }
}

function returnsOb(){
   return {};
}

function returns3PointFunc(){
   return function(x, y, z){
   }
}

function times(funcs, params){
   let sum = [];
   const t = params[0]
   for (var i = 0; i < t; i++){
      sum = sum.concat(funcs);
   }
   return sum;
}
