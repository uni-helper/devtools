# [WIP]uni-devtools

## TODO

- [x] Monorepo改造
- [x] 像素风格uni-helper的LOGO
- [x] ~~小程序与webview通讯包封装~~ 使用websocket传递数据
- [x] 编译到H5时，使用vite-plugin-vue-devtools
- [x] 重构pages.json读取逻辑
- [x] 重构插入组件逻辑
- [x] 使用tRPC
  - [x] 适配uni-app trpc(仅适配支持websocket)
- [x] tab重构
- [x] ~~封装小程序JS-SDK~~ 使用websocket传递数据
- [x] build时不执行plugin
- [x] 支持在浏览器打开页面
- [x] ~~浏览器窗口数据传递~~ 使用websocket传递数据
- [x] 欢迎页面
- [x] overview页面
- [ ] pages页面
  - [x] 区分tabBar Pages
  - [x] 渲染页面
  - [x] 页面跳转
  - [x] 页面搜素
  - [x] 路由传参
  - [x] 打开组件代码位置vscode
  - [x] page配置信息显示
- [ ] 组件页面
  - [x] 组件渲染
  - [x] 组件搜索
  - [x] 组件跳转代码位置vscode
  - [ ] 组件文件数据
- [x] 资源页面
  - [x] 获取静态资源
  - [x] 渲染文件
  - [x] 搜索
  - [x] 文件详情
  - [x] 在编辑器中打开
- [ ] Pinia页面
  - [x] 获取state数据
  - [ ] 获取getters数据
  - [x] 支持两种范式
  - [x] 渲染数据
    - [x] key
    - [x] 树形结构
- [ ] inspect页面
  - [x] 加载inspect插件
  - [x] 保存build文件
  - [x] 加载inspect build文件
  - [x] 页面渲染
  - [x] 主题跟随切换
  - [ ] h5兼容
- [ ] console页面
  - [x] 劫持uni-app console信息
  - [x] 通过devtools服务器转发劫持的log信息
    - [x] 解决打印数据为循环引用和复杂结构，无法序列化
  - [x] 获取console调用栈信息
  - [ ] 渲染log信息
    - [x] 基本类型渲染
    - [ ] 对象tree组件
      - [ ] 根节点key解析
        - [ ] 基本类型
          - [x] string
          - [x] number
          - [x] bigint
          - [x] boolean
          - [x] undefined
          - [x] null
          - [x] Symbol
        - [ ] 复杂类型
          - [ ] object
          - [ ] array
        - [x] 多参数渲染
  - [x] 在vscode里打开输入log信息的本地文件
