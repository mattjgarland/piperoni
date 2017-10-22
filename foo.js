let arr = [1,2,3,4]

function addOne(num){
    return new Promise((resolve, reject) => {
        setImmediate(() => {
            resolve(num + 1)
        })
    })
}

function *gen(){
    for (let i = 0; i < arr.length; i++){
        arr[i] = yield addOne(arr[i])
    }
    yield arr
}

function runner(cb){
    let it = gen()
    step()
    function step(init){
        let {done, value} = it.next(init)
        if (!done){
            if (value instanceof Promise){
                value.then((num) => {
                    step(num)
                })
            } else if (Array.isArray(value)){
                step(value)
            }
        } else {
            cb(init)
        }
    }
}
runner((init) => console.log(init))
