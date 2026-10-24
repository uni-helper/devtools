/**
 * Panel Client: 面板端原生 JS 客户端 (ES Module)
 * 基于 devframe 官方客户端 df-client.mjs 通信
 */

import { connectDevframe } from './df-client.mjs'

// UI 状态与事件绑定
(async function initPanel() {
  const statusPill = document.getElementById('statusPill')
  const statusText = document.getElementById('statusText')
  const wsEndpointLabel = document.getElementById('wsEndpointLabel')
  const latencyLabel = document.getElementById('latencyLabel')
  const treeContainer = document.getElementById('treeContainer')
  const nodeDetails = document.getElementById('nodeDetails')
  const refreshBtn = document.getElementById('refreshBtn')
  const pingBtn = document.getElementById('pingBtn')
  const searchInput = document.getElementById('searchInput')
  const toggleJsonBtn = document.getElementById('toggleJsonBtn')

  let currentTreeData = null
  let isJsonView = false
  let selectedNodeId = null

  let client = null
  let my = null
  let isConnecting = false
  let reconnectTimer = null

  async function connect() {
    if (isConnecting)
      return
    isConnecting = true
    statusPill.className = 'status-pill connecting'
    statusText.textContent = 'Connecting...'

    try {
      // 提取 URL 中的鉴权 token，显式传给官方客户端（避免触发终端临时码弹窗）
      const params = new URLSearchParams(window.location.search)
      const token = params.get('devframe_auth_token') || params.get('token') || ''
      client = await connectDevframe({
        authToken: token,
        simpleAuth: false,
      })
      my = client.scope('uni-helper-devtools')

      statusPill.className = 'status-pill connected'
      statusText.textContent = 'Connected'

      const metaBase = client.connection?.metaBaseUrl || window.location.origin
      wsEndpointLabel.textContent = `Endpoint: ${metaBase}`

      client.events.on('connection:status', (status) => {
        if (status === 'connected') {
          statusPill.className = 'status-pill connected'
          statusText.textContent = 'Connected'
        }
        else if (status === 'connecting') {
          statusPill.className = 'status-pill connecting'
          statusText.textContent = 'Connecting...'
        }
        else {
          statusPill.className = 'status-pill disconnected'
          statusText.textContent = status === 'error' ? 'Error' : 'Disconnected'
          scheduleReconnect()
        }
      })

      client.events.on('connection:error', () => {
        statusPill.className = 'status-pill disconnected'
        statusText.textContent = 'Error'
        scheduleReconnect()
      })

      await fetchComponentTree()
    }
    catch (err) {
      statusPill.className = 'status-pill disconnected'
      statusText.textContent = 'Disconnected'
      wsEndpointLabel.textContent = `Endpoint: Error (${err.message || err})`
      scheduleReconnect()
    }
    finally {
      isConnecting = false
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer)
      return
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null
      try {
        if (client) {
          client.close?.()
          client = null
          my = null
        }
      }
      catch {}
      await connect()
    }, 3000)
  }

  // 1. 调用 RPC 采集组件树
  async function fetchComponentTree() {
    if (!my) {
      await connect()
      if (!my)
        return
    }

    refreshBtn.disabled = true
    const startTime = Date.now()

    try {
      const result = await my.rpc.call('get-component-tree')
      const latency = Date.now() - startTime
      latencyLabel.textContent = `Latency: ${latency} ms`

      currentTreeData = result
      renderView()
    }
    catch (err) {
      latencyLabel.textContent = 'Latency: Error'
      treeContainer.innerHTML = `
        <div class="empty-state" style="color: var(--danger);">
          <span>Failed to fetch component tree: ${escapeHtml(err.message || String(err))}</span>
        </div>
      `
    }
    finally {
      refreshBtn.disabled = false
    }
  }

  // 2. Ping 功能
  async function pingAgent() {
    if (!my) {
      await connect()
      if (!my)
        return
    }

    pingBtn.disabled = true
    const startTime = Date.now()
    try {
      const res = await my.rpc.call('ping')
      const latency = Date.now() - startTime
      const agentStatus = res?.agentConnected ? 'Agent: Online' : 'Agent: Not Connected'
      latencyLabel.textContent = `Ping: ${latency} ms (${agentStatus})`
    }
    catch (err) {
      latencyLabel.textContent = `Ping failed: ${err.message}`
    }
    finally {
      pingBtn.disabled = false
    }
  }

  // 3. 视图渲染
  function renderView() {
    if (!currentTreeData)
      return

    if (isJsonView) {
      treeContainer.innerHTML = `<pre class="code-block">${escapeHtml(JSON.stringify(currentTreeData, null, 2))}</pre>`
      return
    }

    const filterText = searchInput.value.trim().toLowerCase()
    const pages = Array.isArray(currentTreeData)
      ? currentTreeData
      : (currentTreeData.pages || [currentTreeData])

    if (!pages || pages.length === 0) {
      treeContainer.innerHTML = '<div class="empty-state">No pages detected.</div>'
      return
    }

    treeContainer.innerHTML = ''

    for (const page of pages) {
      const pageWrapper = document.createElement('div')
      pageWrapper.style.marginBottom = '20px'

      const pageHeader = document.createElement('div')
      pageHeader.style.fontWeight = 'bold'
      pageHeader.style.fontSize = '14px'
      pageHeader.style.marginBottom = '8px'
      pageHeader.style.color = '#e2e8f0'
      pageHeader.textContent = `Page: ${page.route || 'Unknown Route'}`
      pageWrapper.appendChild(pageHeader)

      if (page.components) {
        const rootEl = renderNode(page.components, filterText)
        if (rootEl) {
          pageWrapper.appendChild(rootEl)
        }
        else if (filterText) {
          const matchEmpty = document.createElement('div')
          matchEmpty.style.color = 'var(--text-muted)'
          matchEmpty.style.fontSize = '12px'
          matchEmpty.textContent = 'No matching components.'
          pageWrapper.appendChild(matchEmpty)
        }
      }
      else {
        const noComp = document.createElement('div')
        noComp.style.color = 'var(--text-muted)'
        noComp.style.fontSize = '12px'
        noComp.textContent = 'Empty component root.'
        pageWrapper.appendChild(noComp)
      }

      treeContainer.appendChild(pageWrapper)
    }
  }

  function renderNode(node, filterText) {
    const isMatch = !filterText || (node.name && node.name.toLowerCase().includes(filterText))
    const childElements = []

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const childEl = renderNode(child, filterText)
        if (childEl)
          childElements.push(childEl)
      }
    }

    // 若自身不匹配且无匹配的子节点，则隐藏
    if (!isMatch && childElements.length === 0) {
      return null
    }

    const container = document.createElement('div')
    container.className = 'tree-node'

    const row = document.createElement('div')
    row.className = `tree-node-row ${node.id === selectedNodeId ? 'selected' : ''}`
    row.onclick = (e) => {
      e.stopPropagation()
      selectNode(node)
    }

    const badge = document.createElement('span')
    badge.className = `tag-badge ${node.type || 'component'}`
    badge.textContent = node.type || 'comp'
    row.appendChild(badge)

    const nameSpan = document.createElement('span')
    nameSpan.className = 'node-name'
    nameSpan.textContent = node.name || 'Anonymous'
    row.appendChild(nameSpan)

    if (node.id) {
      const idSpan = document.createElement('span')
      idSpan.className = 'node-id'
      idSpan.textContent = `#${node.id}`
      row.appendChild(idSpan)
    }

    container.appendChild(row)

    if (childElements.length > 0) {
      const childrenBox = document.createElement('div')
      childrenBox.className = 'tree-children'
      childElements.forEach(child => childrenBox.appendChild(child))
      container.appendChild(childrenBox)
    }

    return container
  }

  async function callGetComponentState(id) {
    if (!my) {
      await connect()
      if (!my)
        throw new Error('Not connected to DevTools agent')
    }
    try {
      return await my.rpc.call('get-component-state', { id })
    }
    catch {
      return await my.rpc.call('uni-devtools:agent:getComponentState', { id })
    }
  }

  async function callUpdateComponentState(id, key, value) {
    if (!my) {
      await connect()
      if (!my)
        throw new Error('Not connected to DevTools agent')
    }
    try {
      return await my.rpc.call('update-component-state', { id, key, value })
    }
    catch {
      return await my.rpc.call('uni-devtools:agent:updateComponentState', { id, key, value })
    }
  }

  async function loadAndRenderState(nodeId, containerEl) {
    containerEl.innerHTML = `
      <div style="color: var(--text-muted); font-size: 12px; display: flex; align-items: center; gap: 6px;">
        <span class="status-dot" style="background: var(--warning);"></span> Loading component state...
      </div>
    `

    let state = null
    try {
      state = await callGetComponentState(nodeId)
    }
    catch (err) {
      containerEl.innerHTML = `
        <div style="color: var(--danger); font-size: 12px;">
          Failed to fetch state: ${escapeHtml(err.message || String(err))}
        </div>
      `
      return
    }

    if (!state) {
      containerEl.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">No state returned.</div>'
      return
    }

    containerEl.innerHTML = ''

    const hasSetup = state.setup && Object.keys(state.setup).length > 0
    const hasData = state.data && Object.keys(state.data).length > 0

    if (!hasSetup && !hasData) {
      containerEl.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">No reactive data or setup bindings found on this component.</div>'
      return
    }

    // 1. 渲染 Composition API (Setup)
    if (hasSetup) {
      const setupHeader = document.createElement('div')
      setupHeader.style.cssText = 'font-weight: 600; font-size: 13px; color: #c084fc; margin-bottom: 8px;'
      setupHeader.textContent = 'Composition API (Setup)'
      containerEl.appendChild(setupHeader)

      for (const [key, field] of Object.entries(state.setup)) {
        const card = createFieldCard(nodeId, key, field.type, field.value, containerEl)
        containerEl.appendChild(card)
      }
    }

    // 2. 渲染 Options API (Data)
    if (hasData) {
      const dataHeader = document.createElement('div')
      dataHeader.style.cssText = 'font-weight: 600; font-size: 13px; color: #fbbf24; margin: 12px 0 8px;'
      dataHeader.textContent = 'Options API ($data)'
      containerEl.appendChild(dataHeader)

      for (const [key, val] of Object.entries(state.data)) {
        const card = createFieldCard(nodeId, key, 'data', val, containerEl)
        containerEl.appendChild(card)
      }
    }
  }

  function createFieldCard(nodeId, key, type, value, stateContainerEl) {
    const card = document.createElement('div')
    card.className = 'state-card'

    const header = document.createElement('div')
    header.className = 'state-header'

    const keyLabel = document.createElement('span')
    keyLabel.className = 'state-key'
    keyLabel.textContent = key
    header.appendChild(keyLabel)

    const badge = document.createElement('span')
    badge.className = `tag-badge ${type}`
    badge.textContent = type
    header.appendChild(badge)

    card.appendChild(header)

    const textarea = document.createElement('textarea')
    textarea.className = 'state-input'
    const formattedVal = (typeof value === 'object' && value !== null)
      ? JSON.stringify(value, null, 2)
      : (typeof value === 'string' ? value : String(value))
    textarea.value = formattedVal
    const lineCount = (formattedVal.match(/\n/g) || []).length + 1
    textarea.rows = Math.min(Math.max(lineCount, 1), 6)
    card.appendChild(textarea)

    const actionRow = document.createElement('div')
    actionRow.className = 'state-action-row'

    const msgSpan = document.createElement('span')
    msgSpan.className = 'state-msg'
    actionRow.appendChild(msgSpan)

    const saveBtn = document.createElement('button')
    saveBtn.className = 'btn-sm primary'
    saveBtn.textContent = 'Save'
    saveBtn.onclick = async () => {
      saveBtn.disabled = true
      msgSpan.className = 'state-msg'
      msgSpan.textContent = 'Saving...'

      let parsed = textarea.value
      try {
        parsed = JSON.parse(textarea.value)
      }
      catch {}

      try {
        await callUpdateComponentState(nodeId, key, parsed)
        msgSpan.className = 'state-msg success'
        msgSpan.textContent = 'Saved!'
        setTimeout(() => {
          loadAndRenderState(nodeId, stateContainerEl)
        }, 600)
      }
      catch (err) {
        msgSpan.className = 'state-msg error'
        msgSpan.textContent = `Error: ${err.message || String(err)}`
        saveBtn.disabled = false
      }
    }
    actionRow.appendChild(saveBtn)

    card.appendChild(actionRow)
    return card
  }

  function selectNode(node) {
    selectedNodeId = node.id
    renderView()

    nodeDetails.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div><strong>Name:</strong> ${escapeHtml(node.name || 'Anonymous')}</div>
        <div><strong>ID:</strong> ${escapeHtml(node.id || 'N/A')}</div>
        <div><strong>Type:</strong> ${escapeHtml(node.type || 'component')}</div>
        <div><strong>File:</strong> ${escapeHtml(node.file || 'N/A')}</div>
        <div><strong>Children Count:</strong> ${node.children ? node.children.length : 0}</div>
      </div>
      <div style="margin-top: 14px; font-weight: bold; font-size: 13px; color: #e2e8f0; border-top: 1px solid var(--border); padding-top: 12px;">
        State &amp; Props Inspector
      </div>
      <div id="stateFieldsContainer" style="margin-top: 8px;"></div>
      <div style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 12px;"><strong>Raw Snapshot:</strong></div>
      <pre class="code-block" style="margin-top: 6px;">${escapeHtml(JSON.stringify(node, null, 2))}</pre>
    `

    const stateBox = document.getElementById('stateFieldsContainer')
    if (stateBox && node.id) {
      loadAndRenderState(node.id, stateBox)
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  // 事件监听
  refreshBtn.addEventListener('click', () => fetchComponentTree())
  pingBtn.addEventListener('click', () => pingAgent())
  searchInput.addEventListener('input', () => renderView())
  toggleJsonBtn.addEventListener('click', () => {
    isJsonView = !isJsonView
    toggleJsonBtn.textContent = isJsonView ? 'Tree View' : 'Toggle JSON'
    renderView()
  })

  // 启动初始连接
  await connect()
})()
