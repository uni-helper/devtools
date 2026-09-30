# 为什么能拿到编译前的变量名？

## 问题

在小程序的 `appData` 中看到的都是编译后的混淆变量名（如 `a`, `b`, `c`），但 uni-helper-devtools 却能显示原始的变量名（如 `count`, `name`, `userInfo`），这是如何实现的？

---

## 答案：在编译时注入，而不是运行时获取

### 核心原理

**uni-helper-devtools 不是在运行时从 `appData` 中读取变量名，而是在 Vite 编译时就把原始变量名注入到代码中。**

这是通过 **Vite 插件** + **Vue SFC 编译器** 实现的：

```
源代码 (.vue)
    ↓ Vite 插件拦截
    ↓ Vue SFC 编译器解析 (获取 bindings)
    ↓ 注入 setupProxy 代码
    ↓ 编译后的代码 (包含原始变量名)
    ↓ 打包到小程序
    ↓ 运行时通过 setupProxy 发送到 DevTools
```

---

## 详细实现

### 1. Vite 插件拦截 Vue 文件

```typescript
// packages/plugin/src/index.ts
export function UniDevtools() {
  return {
    name: 'uni-devtools',
    enforce: 'pre', // 在其他插件之前执行
    
    async transform(code: string, id: string) {
      // 只处理 .vue 文件
      if (!id.endsWith('.vue')) return
      
      // 注入 DevTools 代码
      return await injectDevtoolInfo(code, id)
    }
  }
}
```

### 2. 使用 Vue SFC 编译器获取 bindings

关键在于 `@vue/compiler-sfc` 的 `compileScript` 函数：

```typescript
// packages/plugin/src/utils/parse.ts
import { compileScript } from 'vue/compiler-sfc'

export function parseScript(descriptor: SFCDescriptor, id: string) {
  return compileScript(descriptor, { id })
}
```

**`compileScript` 返回的对象包含 `bindings` 属性，这就是原始变量名的来源！**

```typescript
const content = parseScript(descriptor, id)
const bindings = content.bindings

// bindings 示例：
{
  count: 'setup-ref',      // ref 变量
  name: 'setup-ref',       // ref 变量
  userInfo: 'setup-reactive', // reactive 变量
  handleClick: 'setup-const'  // 函数
}
```

### 3. 注入 setupProxy 代码

```typescript
// packages/plugin/src/injects/injectVueFile.ts

// 提取需要监听的变量（过滤掉导入的变量和函数）
const watchBindings = Object.keys(bindings).filter(key => {
  // 跳过从 vue 或其他地方导入的变量
  if (imports.includes(key)) return false
  return true
})

// 生成注入代码
const setupProxyCode = `
  const bindings = {${watchBindings.join(', ')}};
  setupProxy(bindings);
`

// 注入到 <script setup> 的末尾
ms.appendRight(scriptSetup.loc.end.offset, setupProxyCode)
```

### 4. 编译后的代码示例

**原始代码：**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
const name = ref('')

function increment() {
  count.value++
}
</script>
```

**注入后的代码（在编译时）：**

```typescript
import { ref } from 'vue'
import { setupProxy } from '@uni-helper/devtools/inspect/setupProxy.js'

const count = ref(0)
const name = ref('')

function increment() {
  count.value++
}

// 👇 这是注入的代码，包含原始变量名！
const bindings = { count, name, increment }
setupProxy(bindings)
```

**注意：** 虽然小程序编译后会把 `count` 混淆成 `a`，但 `bindings` 对象的 **key** 仍然是字符串 `"count"`，不会被混淆！

```javascript
// 编译后的代码（简化）
const a = ref(0)  // count 被混淆成 a
const b = ref('')  // name 被混淆成 b

function c() {  // increment 被混淆成 c
  a.value++
}

// 👇 关键：对象的 key 是字符串，不会被混淆！
const bindings = { 
  "count": a,      // key 还是 "count"
  "name": b,       // key 还是 "name"
  "increment": c   // key 还是 "increment"
}
setupProxy(bindings)
```

### 5. setupProxy 发送原始变量名

```javascript
// packages/plugin/inspect/setupProxy.js
export function setupProxy(reactiveBindings) {
  const componentId = getCurrentInstance().uid
  
  // 遍历 bindings，key 就是原始变量名
  for (const [key, binding] of Object.entries(reactiveBindings)) {
    // 跳过函数
    if (typeof binding === 'function') continue
    
    // 监听变化
    watch(() => binding.value, (newValue) => {
      // 发送到 DevTools，key 是原始变量名
      trpc.sendComponentData.subscribe({
        key,  // "count" 而不是 "a"
        id: componentId,
        value: stringify([newValue])
      })
    })
  }
}
```

---

## 为什么对象的 key 不会被混淆？

### JavaScript 混淆规则

混淆工具（如 Terser、UglifyJS）**只会混淆变量名，不会混淆字符串字面量和对象属性名**。

**会被混淆的：**

```javascript
const myVariable = 123  // myVariable → a
function myFunction() {} // myFunction → b
```

**不会被混淆的：**

```javascript
const obj = {
  "myKey": 123  // "myKey" 保持不变
}

obj.myProperty = 456  // obj["myProperty"] 保持不变
```

### 实际例子

**注入的代码：**

```javascript
const bindings = { count, name }
```

**编译后：**

```javascript
const bindings = { count: a, name: b }
```

注意这里 `count` 和 `name` 虽然作为变量引用被混淆了，但它们会被转换成对象字面量的简写语法：

```javascript
// ES6 简写
{ count, name }

// 等价于
{ "count": count, "name": name }

// 编译后
{ "count": a, "name": b }
```

所以最终 **key 仍然是 `"count"` 和 `"name"`，没有被混淆！**

---

## 对比：其他 DevTools 的做法

### Vue DevTools (浏览器扩展)

Vue DevTools 无法使用编译时注入，因为它运行在浏览器扩展中，无法访问源代码。所以它：

1. **使用 Vue 内部的 `setupState`**：Vue 内部保留了变量名的映射
2. **使用 Source Maps**：在开发模式下，通过 source maps 还原变量名
3. **局限性**：生产环境无法获取原始变量名

### uni-helper-devtools 的优势

因为我们是 **Vite 插件**，可以在编译时注入代码，所以：

✅ **无需 Source Maps**  
✅ **生产环境也可用**（如果保留注入代码）  
✅ **更可靠**：不依赖运行时的内部 API  
✅ **性能更好**：不需要额外的映射和查找

---

## 关键技术点总结

| 技术 | 作用 |
|-----|------|
| **Vite 插件** | 拦截 `.vue` 文件的编译过程 |
| **@vue/compiler-sfc** | 解析 SFC，获取 `bindings`（原始变量名） |
| **MagicString** | 在不破坏 source map 的情况下修改代码 |
| **对象字面量** | 利用 key 不会被混淆的特性保留变量名 |
| **setupProxy** | 运行时发送数据到 DevTools |

---

## 代码流程图

```
┌─────────────────────────────────────────────────────────────┐
│  开发者编写源代码                                             │
│  <script setup>                                             │
│    const count = ref(0)                                     │
│  </script>                                                  │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Vite 插件拦截                                               │
│  transform(code, id)                                        │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Vue SFC 编译器解析                                          │
│  compileScript(descriptor)                                  │
│  返回: { bindings: { count: 'setup-ref' } }                │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  注入 setupProxy 代码                                        │
│  const bindings = { count }  // ← 关键：包含原始变量名      │
│  setupProxy(bindings)                                       │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  小程序编译（混淆）                                           │
│  const a = ref(0)  // count → a                            │
│  const bindings = { "count": a }  // key 不混淆！           │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  运行时                                                      │
│  setupProxy 遍历 bindings                                   │
│  for (const [key, value] of Object.entries(bindings))      │
│    // key = "count" ← 原始变量名！                          │
│    trpc.sendComponentData({ key, value })                  │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  DevTools 客户端                                             │
│  显示: count: 0  ← 原始变量名！                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 为什么 Devframe 重写后仍然可以用这个方法？

**完全可以！** 这个编译时注入的技术与 Devframe 架构是正交的。

### 在 Devframe 架构中的位置

```
┌─────────────────────────────────────────────────────────────┐
│  Vite 插件（编译时注入）                                      │
│  - 获取 bindings（原始变量名）                                │
│  - 注入 setupProxy 代码                                      │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Platform Adapter（运行时）                                  │
│  - setupProxy 收集数据                                       │
│  - 通过 Devframe Transport 发送                             │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Devframe RPC Layer                                         │
│  - 接收数据（包含原始变量名）                                 │
│  - 转发给 Inspector                                         │
└─────────────────────────────────────────────────────────────┘
```

### 需要调整的部分

1. **Vite 插件层**：保持不变，继续注入原始变量名
2. **setupProxy**：改为调用 Devframe Adapter 的 API
3. **Adapter**：接收包含原始变量名的数据，转发给 Devframe

```typescript
// 改造后的 setupProxy
export function setupProxy(reactiveBindings) {
  const adapter = getDevframeAdapter()
  const componentId = getCurrentInstance().uid
  
  for (const [key, binding] of Object.entries(reactiveBindings)) {
    watch(() => binding.value, (newValue) => {
      // 调用 Devframe Adapter API
      adapter.updateComponentState({
        id: componentId,
        key,  // 原始变量名
        value: newValue
      })
    })
  }
}
```

---

## 结论

**uni-helper-devtools 能拿到编译前的变量名，关键在于：**

1. ✅ **编译时注入**：在 Vite 编译时通过 `@vue/compiler-sfc` 获取原始变量名
2. ✅ **对象字面量**：利用对象 key 不会被混淆的特性保留变量名
3. ✅ **运行时传递**：setupProxy 在运行时将原始变量名发送到 DevTools

这是一个巧妙的设计，利用了编译工具和 JavaScript 语言特性，在不需要 Source Maps 的情况下保留了变量名。

---

**最后更新**：2026-09-30  
**作者**：Uni-Helper Team
