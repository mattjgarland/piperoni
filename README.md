### PIPERONI

Piperoni helps you make pipeable APIs in Javascript.

Piping is composing functions together, feeding the return of one function into the parameters of the next:

`let output = doThis(doThat(doTheOtherThing(input)))`

Isn't that clear? There are real benefits to modeling as much of your logic as possible on data flow pipes like this. Like, refactoring become a snap:

`let output = oneMoreChange(doThis(doThat(doTheOtherThing(input))))`

Do all these functions have to take one parameter? Yes. There is no free lunch. You only get the benefits of pipes if you cram your logic into pipe-like shapes.

Piperoni helps you:

- Fashion pipes with familiar, flexible chaining:

  `myPipe.doThis().doThat.doTheOtherThing()`

- Mix sync and async functions indiscriminately:

  `myPipe.doAsyncThing().doSyncThing().doAnotherAsyncThing()`

- Use utilities from Ramda, which gives every pipe the power of lodash or underscore:

  `myPipe.zip().map().pluck().etc()`

- Group, then share, related functions:

   Creating methods from functions:

   `myPipe.methize(doThis, doThat, doTheOtherThing)`

   Turning pipes into methods of other pipes:

   `myPipe.methize(myOtherPipe.funcize())`

   Cloning to support variations:

   `let myPipe = myOtherPipe.clone()`

- Handle logic that doesn't fit neatly into the data-flow model, i.e, parallelism, conditionals, and no-ops, with tag methods:

  ```js
  myPipe.doThis()
        .startParallel() //Tag function
        .doAsync(100)
        .doAsync(1000)
        .doAsync(10000)
        .stopParallel() //Tag function
        .doTheOtherThing()
  ```
  _startParallel_ and _stopParallel_ are "tag" functions because, like markup tags, they apply special logic to their inner contents (here, methods calls).

### Simple Composition

"c" is for "compose"

```js
const makePipe = require("piperoni").makePipe
const assert = require("assert")

function addOne(x){return x + 1}
function addTwo(x){return x + 2}

const pipe = makePipe()
//Use "c" to compose the pipe.
pipe.in(0).c(addOne).c(addTwo).out((err, num) => {assert(num === 3)})
//"in" and "out" methods handle input and output.
//"out" is captured async style, because any function in the pipe could be async.
```
If you've piped before, you can guess the next optimization. The spice of Javascript is...curry:

```js
//Return not a sum but a function that adds y to whatever parameter it gets.
function add(y){return x => x + y}
//Use that higher-order function to produce a function to be composed.
pipe.in(0).c(add(1)).c(add(2)).out((err, num) => {assert(num === 3)})
```

Currying is huge for piping. With currying, you can:

- Ratchet a function down to one parameter.
- Vary a function to produce other functions quickly.
- Concentrate and express state in one place orthogonal to the data flow.  

### Creating Methods

 If we could compose functions by calling chainable methods, wouldn't that look cleaner? Now you can:

```
 pipe.methize(add)
 pipe.in(0).add(1).add(2).out((err, num) => assert(num === 3))
 ```

Remember that the method is a higher-order function. _add_ is **not** being composed, the function it produces is the one actually getting piped:

HIGHER-ORDER or Currying Function
```js
function add(y){return x => x + y}
```

COMPOSED or Curried Function

```js
x => x + y
//Javascript closure keeps _y_ alive and remembered (as 1 or 2, in this case).
```

### Mixins

Piperoni allows you to group functions together as methods of a pipe. Once they populate pipes, they can also be convenientially shared between pipes.

Suppose you've created this pipe to manipulate files...

`let filePipe = makePipe().methize(stats, readFiles, copyFiles, moveFiles)`

..and this pipe to connect to a Restful API...

`let restPipe = makePipe().methize(create, read, update, destroy)`

...and you need functionality from both pipes:

```js
//TASK: Read files in a directory and store them online
//First mixin the relevant pipes
const myPipe = makePipe().mixin(filePipe, restPipe)
myPipe.in("/myDirName")
      .stats()
      .filter(weedOutByExtension) //a Ramda utility function + your custom function
      .c(oneOffMunging)
      .readFiles()
      .create("SavedFilesResource")
      .out((err, message) => {
         assert(message.status === "ok")
      })
```
Note: find a complete list of Ramda utilities at [Ramda Documentation](http://ramdajs.com/docs/#all). All functions are exposed as pipe methods, but only the higher-order ones will work as methods. The other ones can be accessed at:

```js
let Piperoni = require("piperoni")
console.log(Piperoni.r.someNonCurryingFunction)
```
### Reusing, Composing and Cloning Pipes

A pipe has two aspects: its methods, and the composition built up by the methods. Mixins are how you repeat the methods. Now let's repeat the composition.

Every time a pipe is "outed," a new composition is executed. So the same pipe can be outed repeatedly:

```js
pipe.add(1).add(2)
//First execution.
pipe.in(10).out((err, sum) => assert(sum === 13))
//Second execution.
pipe.in(100).out((err, sum) => assert(sum === 103))
//"in" can be called anywhere before "out"

```
This pipe can also be used as a one-off function in another pipe...
```js
let addThree = pipe.exec
otherPipe.in(0).c(addThree).out((err, num) => assert(num === 3))
```

...or transformed into a higher-order function and added as a method to another pipe:

```js
otherPipe.methize(pipe.funcize("addThree"))
otherPipe.in(0).addThree().out((err, num) => assert(num === 3))
```
Lastly, we can duplicate the pipe so the duplicate can diverge from the original composition:

```js
let oldPipe = makePipe.methize(add).add(1).add(2)
let newPipe = oldPipe.clone()

oldPipe.add(10)//vary the original
newPipe.add(100)//vary the clone

oldPipe.in(0).out((err, sum) => assert(sum === 13))
newPipe.in(0).out((err, sum) => assert(sum === 103))
```

To clear the composition from a pipe, _clear_ it.

`let newPipe = oldPipe.clone().clear()`

### Async

Everything above and below applies to async as well as sync methods and functions. However, Piperoni does need to differentiate between async and sync functions to compose them. Consequently, just as all sync functions should be curried to take **one** parameter, all async functions should take **two.**

```
//higher-order sync function
function add(increment){
   return num => num + increment
}

//the signature of a Piperoni async function is two params
//the second is a Node.js-style callback

function waitAndAdd(increment, waitTime){
   return (num, callback) = {
      setTimeout(() = > {
            //No error.
            callback(null, num + increment)
      }), waitTime)
   }
}
```
Piperoni will use the callback internally to execute a composition.

### Tag Methods For Non-Linear Logic

Here is a tag method at work:

```js
myPipe.doThis()
      .startParallel()//TAG METHOD
      .doAsync(100)
      .doAsync(1000)
      .doAsync(10000)
      .stopParallel()//TAG METHOD
      .map(processThreeResults)
```
Tag methods step outside the linear flow of data from composed function to composed function. In the code above, the three functions created by _doThat_ are invoked in parallel and the results forwarded as an array to _map._

Another out-of-the-box tag method is _which_, which chooses "which" of the composed functions should be invoked.

```js
myPipe.doThis()
      .startWhich(chooseFuncIndex)//chooseFuncindex looks at input and returns an index of the inner functions to invoke.
      .doAsync(100)
      .doAsync(1000)//If chooseFuncIndex returns an index of 1, the function produced by this will be invoked.
      .doAsync(10000)
      .stopWhich()
      .map(processThreeResults)
```

No-ops/pass-throughs are also very possible:

```js
myPipe.doThis()
      .startMaybe(ifNecessary)//ifNecessary decides whether to invoke its children
      .startWhich(chooseFunc)
      .doAsync(100)
      .doAsync(1000)
      .doAsync(10000)
      .stopWhich()
      .map(processThreeResults)
      .stopMaybe()
```

Moving conditional and non-linear logic logic out of composable functions and into Piperoni keeps the functions simpler and more reusable.  

Adding your own tag methods to a pipe is trivial. Just come up with a name and an associated function that transforms the array of inner functions (the three functions produced by _doAsync_) into a new array of functions.

Let's say we want a tag method that repeats a function in a composition. It would work like this:

```js
myPipe.startTimes(5)
      .add(1)//The inner functions will produce 1...
      .add(1)//...then 2...
      .stopTimes()//...5 times.
      .in(0)
      .out((err, num) => assert(num === 10))
```
Here's how we could make the tag method:
```js
//Create a function to replace inner composed functions with a new array of functions
function times(funcs, params){
   let newFuncs = [];
   const num = params[0]//Grab the curry value from the tag function (how many "times"?)
   for (var i = 0; i < num; i++){
      newFuncs = newFuncs.concat(funcs);//Repeat the inner functions num times.
   }
   return newFuncs;
}

//Add a name and the associated function.
myPipe.tagize({times: times})

//You are free to use "startTimes(myNum)" and "stopTimes()"."
```
Tag logic often has to treat sync and async functions separately. Consult Piperoni's _parallel_ and _which_ implementations for guidance.
