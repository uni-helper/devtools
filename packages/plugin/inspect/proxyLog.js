(function () {
  // 创建一个处理器对象
  const handler = {
    apply(target, thisArg, argumentsList) {
      // 调用原始 console 方法
      target.apply(thisArg, argumentsList)

      // 将信息发送到后端
      fetch('https://your-backend-url.com/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: target.name, messages: argumentsList }),
      })
        .then(response => response.json())
        .then(data => console.log('Log sent to server:', data))
        .catch(error => console.error('Error sending log to server:', error))
    },
  }

  // 为 console 的每个方法创建一个代理
  for (const key in console) {
    if (typeof console[key] === 'function') {
      console[key] = new Proxy(console[key], handler)
    }
  }
})()
