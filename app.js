/**
 * Oikos Companion — Pear Runtime Frontend
 *
 * Vanilla JS frontend for the Oikos Pear desktop app.
 * Communicates with the Bare main process via internal HTTP API on :13421.
 * The main process connects to the agent over Hyperswarm P2P.
 * No token auth needed — internal API is process-local.
 *
 * Views: Overview, Wallet, Swarm, Policies, Audit, Chat
 */

/* global Pear */

const API_BASE = 'http://127.0.0.1:13421'
let currentView = 'overview'
let refreshInterval = null

// ── Asset constants ──
const COLORS = { USDT: '#22c55e', XAUT: '#d4a843', USAT: '#3b82f6', BTC: '#f97316', ETH: '#06b6d4' }
const DOTS = { USDT: 'c-usdt', XAUT: 'c-xaut', USAT: 'c-usat', BTC: 'c-btc', ETH: 'c-eth' }
const PRICES = { USDT: 1, USAT: 1, XAUT: 2400, BTC: 60000, ETH: 3000 }
const DECS = { USDT: 6, USAT: 6, XAUT: 6, BTC: 8, ETH: 18 }

// ── API helper (no auth — internal API is process-local) ──

async function api (method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  }
  if (body) opts.body = JSON.stringify(body)
  try {
    const res = await fetch(API_BASE + path, opts)
    return await res.json()
  } catch (e) {
    console.error('[app] API error:', path, e.message)
    return null
  }
}

// ── Prices ──

async function fetchPrices () {
  const data = await api('GET', '/api/prices')
  if (data && data.prices && data.prices.length > 0) {
    data.prices.forEach(function (p) {
      if (p.symbol && p.priceUsd !== undefined) PRICES[p.symbol] = p.priceUsd
    })
  }
}

// ── Portfolio calc ──

function allocate (balances) {
  const items = balances.map(function (b) {
    const raw = parseInt(b.balance || '0', 10)
    const d = DECS[b.symbol] || 18
    const human = raw / Math.pow(10, d)
    const usd = human * (PRICES[b.symbol] || 0)
    return { symbol: b.symbol, chain: b.chain, formatted: b.formatted, usd: usd }
  })
  const total = items.reduce(function (s, e) { return s + e.usd }, 0)
  return {
    total: total,
    items: items.map(function (e) {
      return { symbol: e.symbol, chain: e.chain, formatted: e.formatted, usd: e.usd, pct: total > 0 ? (e.usd / total * 100).toFixed(1) : '0.0' }
    })
  }
}

// ── Navigation ──

function switchView (name) {
  currentView = name
  document.querySelectorAll('.nav-item').forEach(function (el) {
    el.classList.toggle('active', el.dataset.view === name)
  })
  document.querySelectorAll('.view').forEach(function (el) {
    el.classList.toggle('active', el.id === 'view-' + name)
  })
  // Trigger immediate update for the new view
  updateCurrentView()
}

document.querySelectorAll('.nav-item').forEach(function (el) {
  el.addEventListener('click', function () {
    switchView(el.dataset.view)
  })
})

// ── Badge helper ──

function opBadge (type) {
  const t = (type || 'payment').toLowerCase()
  let cls = 'badge-' + t
  if (!['badge-payment', 'badge-swap', 'badge-bridge', 'badge-yield', 'badge-feedback'].includes(cls)) cls = 'badge-payment'
  return '<span class="op-badge ' + cls + '">' + t.toUpperCase() + '</span>'
}

function fmtAmt (result) {
  const p = result.proposal
  if (!p) return '?'
  const raw = parseInt(p.amount, 10)
  const d = DECS[p.symbol] || 6
  return (raw / Math.pow(10, d)).toFixed(d <= 6 ? 2 : 6)
}

// ── Render helpers ──

function renderAllocBar (containerId, items) {
  const el = document.getElementById(containerId)
  if (!el) return
  el.innerHTML = items.map(function (i) {
    const c = COLORS[i.symbol] || '#555'
    return '<div class="alloc-seg" style="width:' + parseFloat(i.pct) + '%;background:' + c + ';" title="' + i.symbol + ': ' + i.pct + '%"></div>'
  }).join('')
}

function renderAssetList (containerId, items) {
  const el = document.getElementById(containerId)
  if (!el) return
  el.innerHTML = items.map(function (i) {
    const dotCls = DOTS[i.symbol] || ''
    return '<div class="asset-row">' +
      '<div class="asset-left"><span class="asset-dot ' + dotCls + '"></span><span class="asset-symbol">' + i.symbol + '</span><span class="asset-chain">' + i.chain + '</span></div>' +
      '<div class="asset-right"><span class="asset-amount">' + i.formatted + '</span><span class="asset-usd"> $' + i.usd.toFixed(2) + '</span><span class="asset-pct">' + i.pct + '%</span></div>' +
      '</div>'
  }).join('')
}

// ── Status indicators ──

function setDot (id, on) {
  const el = document.getElementById(id)
  if (!el) return
  el.className = 'status-dot ' + (on ? 'on' : 'off')
}

// ── VIEW: Overview ──

async function updateOverview () {
  const [state, health, valuation, identity] = await Promise.all([
    api('GET', '/api/state'),
    api('GET', '/api/health'),
    api('GET', '/api/valuation'),
    api('GET', '/api/identity')
  ])

  if (health) {
    setDot('td-wallet', health.walletConnected)
    setDot('sb-wallet', health.walletConnected)
    setDot('td-swarm', health.swarmEnabled)
    setDot('sb-swarm', health.swarmEnabled)
    setDot('td-companion', health.companionConnected)
    setDot('sb-events', health.eventsBuffered > 0)
  }

  if (state) {
    document.getElementById('kpi-events').textContent = state.eventsSeen || 0
    document.getElementById('kpi-proposals').textContent = state.proposalsSent || 0
    document.getElementById('kpi-proposal-detail').textContent = (state.proposalsApproved || 0) + ' approved / ' + (state.proposalsRejected || 0) + ' rejected'
    document.getElementById('kpi-defi').textContent = state.defiOps || 0
    document.getElementById('reasoning').textContent = state.lastReasoning || 'Connect an agent via MCP to see reasoning.'
    document.getElementById('decision-line').innerHTML = 'Last decision: <strong>' + (state.lastDecision || '--') + '</strong>'
    document.getElementById('decision-badge').textContent = (state.status || 'idle').toUpperCase()

    if (state.balances && state.balances.length > 0) {
      const a = allocate(state.balances)
      document.getElementById('portfolio-total').innerHTML = '$' + a.total.toFixed(2) + ' <span class="currency">USD</span>'
      document.getElementById('kpi-portfolio').textContent = '$' + a.total.toFixed(0)
      document.getElementById('kpi-assets').textContent = state.balances.length + ' assets'
      renderAllocBar('alloc-bar', a.items)
      renderAssetList('asset-list', a.items)
    }

    // Use valuation if available for more accurate pricing
    if (valuation && valuation.totalUsd > 0) {
      document.getElementById('portfolio-total').innerHTML = '$' + valuation.totalUsd.toFixed(2) + ' <span class="currency">USD</span>'
      document.getElementById('kpi-portfolio').textContent = '$' + valuation.totalUsd.toFixed(0)
    }

    // Operations
    if (state.recentResults && state.recentResults.length > 0) {
      document.getElementById('op-list').innerHTML = state.recentResults.map(function (r) {
        const type = (r.proposalType || 'payment').toLowerCase()
        const badge = opBadge(type)
        const amount = fmtAmt(r)
        const sym = r.proposal ? r.proposal.symbol : ''
        const hash = r.txHash ? r.txHash.slice(0, 12) + '...' : ''
        const violations = r.violations && r.violations.length > 0 ? ' ' + r.violations[0] : ''
        let extra = ''
        if (type === 'swap' && r.proposal) extra = ' &rarr; ' + (r.proposal.toSymbol || '?')
        else if (type === 'bridge' && r.proposal) extra = ' ' + (r.proposal.fromChain || '?') + ' &rarr; ' + (r.proposal.toChain || '?')

        const st = r.status || 'unknown'
        const indCls = 'op-ind-' + st
        return '<li class="op-item"><div class="op-indicator ' + indCls + '"></div><div class="op-body">' +
          badge + '<span class="op-status">' + st.toUpperCase() + '</span> ' + amount + ' ' + sym + extra +
          (hash ? '<div class="op-hash">tx: ' + hash + '</div>' : '') +
          (violations ? '<div class="op-detail">' + violations + '</div>' : '') +
          '</div></li>'
      }).join('')
    }
  }

  // Identity
  if (identity) {
    const regEl = document.getElementById('id-registered')
    if (identity.registered) {
      regEl.textContent = 'YES'
      regEl.className = 'id-value id-yes'
      document.getElementById('id-agent-id').textContent = identity.agentId ? '#' + identity.agentId : '--'
      document.getElementById('id-wallet-set').textContent = identity.walletSet ? 'YES' : 'NO'
      document.getElementById('id-wallet-set').className = 'id-value ' + (identity.walletSet ? 'id-yes' : 'id-no')
    } else {
      regEl.textContent = 'NO'
      regEl.className = 'id-value id-no'
    }
  }

  document.getElementById('refresh-ts').textContent = new Date().toLocaleTimeString()
}

// ── VIEW: Wallet ──

async function updateWallet () {
  const [balances, addresses, valuation] = await Promise.all([
    api('GET', '/api/balances'),
    api('GET', '/api/addresses'),
    api('GET', '/api/valuation')
  ])

  if (balances && balances.balances) {
    const a = allocate(balances.balances)
    const total = (valuation && valuation.totalUsd > 0) ? valuation.totalUsd : a.total
    document.getElementById('w-portfolio-total').innerHTML = '$' + total.toFixed(2) + ' <span class="currency">USD</span>'
    renderAllocBar('w-alloc-bar', a.items)
    renderAssetList('w-asset-list', a.items)
  }

  if (addresses && addresses.addresses) {
    const el = document.getElementById('w-addresses')
    if (addresses.addresses.length === 0) {
      el.innerHTML = '<div class="empty">No addresses available</div>'
    } else {
      el.innerHTML = addresses.addresses.map(function (a) {
        return '<div style="margin-bottom:0.5rem;">' +
          '<div class="form-label">' + (a.chain || 'unknown') + '</div>' +
          '<div class="mono" style="font-size:0.72rem;color:var(--cyan);word-break:break-all;">' + (a.address || '--') + '</div>' +
          '</div>'
      }).join('')
    }
  }
}

// ── VIEW: Swarm ──

async function updateSwarm () {
  const [swarm, econ] = await Promise.all([
    api('GET', '/api/swarm'),
    api('GET', '/api/economics')
  ])

  if (!swarm || !swarm.enabled) {
    document.getElementById('swarm-disabled').classList.remove('hidden')
    document.getElementById('swarm-content').classList.add('hidden')
    return
  }

  document.getElementById('swarm-disabled').classList.add('hidden')
  document.getElementById('swarm-content').classList.remove('hidden')

  if (swarm.identity) {
    document.getElementById('sw-name').textContent = swarm.identity.name || '--'
    document.getElementById('sw-rep').textContent = ((swarm.identity.reputation || 0) * 100).toFixed(0) + '%'
  }

  const peers = swarm.boardPeers || []
  document.getElementById('sw-peer-count').textContent = peers.length
  if (peers.length > 0) {
    document.getElementById('sw-peers').innerHTML = peers.map(function (p) {
      return '<span class="peer-chip"><span class="peer-dot"></span>' + p.name + ' <span class="peer-rep">' + ((p.reputation || 0) * 100).toFixed(0) + '%</span></span>'
    }).join('')
  } else {
    document.getElementById('sw-peers').innerHTML = '<div class="empty">No peers connected</div>'
  }

  const anns = swarm.announcements || []
  if (anns.length > 0) {
    document.getElementById('sw-anns').innerHTML = anns.slice(0, 15).map(function (a) {
      const catCls = 'cat-' + (a.category || 'service')
      return '<div class="ann-item"><span class="ann-cat ' + catCls + '">' + (a.category || 'service') + '</span> ' +
        '<strong>' + (a.title || 'Untitled') + '</strong><br>' +
        '<span style="font-size:0.68rem;color:var(--dim);">' + (a.agentName || '?') + ' | ' +
        (a.priceRange ? a.priceRange.min + '-' + a.priceRange.max + ' ' + a.priceRange.symbol : '--') + '</span></div>'
    }).join('')
  } else {
    document.getElementById('sw-anns').innerHTML = '<div class="empty">No announcements</div>'
  }

  const rooms = swarm.activeRooms || []
  if (rooms.length > 0) {
    document.getElementById('sw-rooms').innerHTML = rooms.map(function (r) {
      const st = r.status || 'open'
      return '<div class="room-item"><span class="room-badge rb-' + st + '">' + st + '</span> ' +
        '<strong>' + (r.announcement ? r.announcement.title : 'Room ' + (r.id || '?').slice(0, 8)) + '</strong><br>' +
        '<span style="font-size:0.68rem;color:var(--dim);">' + (r.bids || []).length + ' bid(s)' +
        (r.agreedPrice ? ' | Agreed: ' + r.agreedPrice + ' ' + (r.agreedSymbol || '') : '') + '</span></div>'
    }).join('')
  } else {
    document.getElementById('sw-rooms').innerHTML = '<div class="empty">No active rooms</div>'
  }

  // Swarm events
  const events = swarm.recentEvents || []
  if (events.length > 0) {
    document.getElementById('sw-events').innerHTML = events.slice(0, 30).map(function (e) {
      const t = new Date(e.timestamp).toLocaleTimeString()
      return '<div class="event-line"><span class="event-time">' + t + '</span> ' + (e.summary || e.kind) + '</div>'
    }).join('')
  }

  // Economics
  if (econ && econ.enabled && econ.economics) {
    const e = econ.economics
    const rev = Number(e.totalRevenue) || 0
    const cost = Number(e.totalCosts) || 0
    document.getElementById('sw-econ-rev').textContent = '$' + rev.toFixed(2)
    document.getElementById('sw-econ-cost').textContent = '$' + cost.toFixed(2)
    const profit = rev - cost
    const profitEl = document.getElementById('sw-econ-profit')
    profitEl.textContent = '$' + profit.toFixed(2)
    profitEl.className = 'econ-val ' + (profit >= 0 ? 'econ-pos' : 'econ-neg')
    document.getElementById('sw-econ-deals').textContent = e.dealsCompleted || 0

    const sus = e.sustainabilityScore || 0
    const susEl = document.getElementById('sw-sustainability')
    susEl.textContent = (sus * 100).toFixed(0) + '%'
    susEl.className = 'kpi-value ' + (sus >= 0.5 ? 'green' : 'red')
  }
}

// ── VIEW: Policies ──

async function updatePolicies () {
  const pol = await api('GET', '/api/policies')
  if (!pol || !pol.policies) return

  document.getElementById('pol-content').innerHTML = pol.policies.map(function (p) {
    const spent = Object.entries(p.state.sessionTotals || {})
    const rules = (p.rules || []).slice(0, 8)
    const rulesHtml = rules.map(function (r) {
      let desc = r.type
      if (r.amount) desc += ': ' + r.amount + ' ' + r.symbol
      else if (r.seconds) desc += ': ' + r.seconds + 's'
      else if (r.min !== undefined) desc += ': min ' + r.min
      else if (r.start_hour !== undefined) desc += ': ' + r.start_hour + '-' + r.end_hour + ' ' + r.timezone
      return '<div class="policy-rule">' + desc + '</div>'
    }).join('')
    const budgetHtml = spent.map(function (kv) {
      const pct = Math.min(100, Number(kv[1]) / 50000000 * 100)
      const color = pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)'
      return '<div class="policy-rule">' + kv[0] + ': ' + kv[1] + ' spent</div>' +
        '<div class="budget-bar-bg"><div class="budget-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>'
    }).join('')
    return '<div class="policy-item"><div class="policy-name">' + p.name + '</div>' + rulesHtml + budgetHtml + '</div>'
  }).join('')
}

// ── VIEW: Audit ──

async function updateAudit () {
  const data = await api('GET', '/api/audit?limit=100')
  if (!data || !data.entries) return

  document.getElementById('audit-count').textContent = data.entries.length + ' entries'

  if (data.entries.length === 0) {
    document.getElementById('audit-body').innerHTML = '<tr><td colspan="5" class="empty">No audit entries yet</td></tr>'
    return
  }

  document.getElementById('audit-body').innerHTML = data.entries.map(function (e) {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleString() : '--'
    const type = e.proposalType || e.type || '--'
    const status = e.status || '--'
    const statusColor = status === 'executed' ? 'var(--green)' : status === 'rejected' ? 'var(--red)' : 'var(--yellow)'
    const amount = e.proposal ? (e.proposal.amount || '--') : '--'
    const sym = e.proposal ? (e.proposal.symbol || '') : ''
    const detail = e.reason || e.violations?.join(', ') || (e.txHash ? 'tx: ' + e.txHash.slice(0, 16) + '...' : '')
    return '<tr>' +
      '<td class="mono" style="font-size:0.68rem;white-space:nowrap;">' + time + '</td>' +
      '<td>' + opBadge(type) + '</td>' +
      '<td style="color:' + statusColor + ';font-weight:600;">' + status.toUpperCase() + '</td>' +
      '<td class="mono">' + amount + ' ' + sym + '</td>' +
      '<td style="color:var(--muted);font-size:0.72rem;">' + detail + '</td>' +
      '</tr>'
  }).join('')
}

// ── VIEW: Chat (Companion) ──

let chatInstructions = []

async function updateChat () {
  const data = await api('GET', '/api/companion/state')
  if (!data) return

  // Companion status
  const connected = data.companionConnected
  setDot('chat-companion-dot', connected)
  document.getElementById('chat-companion-label').textContent = connected ? 'Connected' : 'Disconnected'

  // Update instructions list (show new ones as system messages)
  const instructions = data.instructions || []
  if (instructions.length > chatInstructions.length) {
    const newOnes = instructions.slice(chatInstructions.length)
    const msgContainer = document.getElementById('chat-messages')
    newOnes.forEach(function (instr) {
      // Only add if this was not sent by us (check if already displayed as user msg)
      const time = new Date(instr.timestamp).toLocaleTimeString()
      const div = document.createElement('div')
      div.className = 'chat-msg system'
      div.innerHTML = '<div>' + escapeHtml(instr.text) + '</div><div class="chat-time">Queued at ' + time + '</div>'
      msgContainer.appendChild(div)
    })
    chatInstructions = instructions.slice()
    msgContainer.scrollTop = msgContainer.scrollHeight
  }

  // Show recent events in chat context
  if (data.events && data.events.length > 0) {
    // We could add event summaries but keep it clean for now
  }
}

function escapeHtml (str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

async function sendInstruction () {
  const input = document.getElementById('chat-input')
  const text = input.value.trim()
  if (!text) return

  const btn = document.getElementById('chat-send')
  btn.disabled = true
  input.value = ''

  // Show user message immediately
  const msgContainer = document.getElementById('chat-messages')
  const div = document.createElement('div')
  div.className = 'chat-msg user'
  div.innerHTML = '<div>' + escapeHtml(text) + '</div><div class="chat-time">' + new Date().toLocaleTimeString() + '</div>'
  msgContainer.appendChild(div)
  msgContainer.scrollTop = msgContainer.scrollHeight

  const result = await api('POST', '/api/companion/instruct', { text: text })
  btn.disabled = false

  if (result && result.ok) {
    // Instruction queued successfully
  } else {
    const errDiv = document.createElement('div')
    errDiv.className = 'chat-msg system'
    errDiv.innerHTML = '<div style="color:var(--red);">Failed to send instruction.</div><div class="chat-time">Error</div>'
    msgContainer.appendChild(errDiv)
  }

  input.focus()
}

document.getElementById('chat-send').addEventListener('click', sendInstruction)
document.getElementById('chat-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendInstruction()
  }
})

// ── Payment form ──

document.getElementById('pay-btn').addEventListener('click', async function () {
  const to = document.getElementById('pay-to').value.trim()
  const amount = document.getElementById('pay-amount').value
  const symbol = document.getElementById('pay-symbol').value
  const chain = document.getElementById('pay-chain').value
  const reason = document.getElementById('pay-reason').value.trim() || 'companion payment'

  if (!to || !amount) {
    showResult('pay-result', 'Please fill in recipient and amount.', true)
    return
  }

  const btn = document.getElementById('pay-btn')
  btn.disabled = true
  btn.textContent = 'Sending...'

  const result = await api('POST', '/api/companion/propose', {
    type: 'payment',
    to: to,
    amount: amount,
    symbol: symbol,
    chain: chain,
    reason: reason
  })

  btn.disabled = false
  btn.textContent = 'Send Payment'

  if (result) {
    showResult('pay-result', JSON.stringify(result, null, 2), result.status === 'rejected' || result.status === 'failed')
  } else {
    showResult('pay-result', 'Request failed — check agent connection.', true)
  }
})

// ── Simulate form ──

document.getElementById('sim-btn').addEventListener('click', async function () {
  const amount = document.getElementById('sim-amount').value
  const symbol = document.getElementById('sim-symbol').value
  const chain = document.getElementById('sim-chain').value

  if (!amount) {
    showResult('sim-result', 'Please enter an amount.', true)
    return
  }

  const btn = document.getElementById('sim-btn')
  btn.disabled = true
  btn.textContent = 'Simulating...'

  const result = await api('POST', '/api/simulate', {
    amount: amount,
    symbol: symbol,
    chain: chain,
    reason: 'dry-run from companion'
  })

  btn.disabled = false
  btn.textContent = 'Simulate'

  if (result) {
    showResult('sim-result', JSON.stringify(result, null, 2), result.status === 'rejected')
  } else {
    showResult('sim-result', 'Simulation failed.', true)
  }
})

function showResult (id, text, isError) {
  const el = document.getElementById(id)
  el.classList.remove('hidden')
  el.textContent = text
  el.style.borderColor = isError ? 'var(--red)' : 'var(--green)'
}

// ── Update dispatcher ──

async function updateCurrentView () {
  switch (currentView) {
    case 'overview': await updateOverview(); break
    case 'wallet': await updateWallet(); break
    case 'swarm': await updateSwarm(); break
    case 'policies': await updatePolicies(); break
    case 'audit': await updateAudit(); break
    case 'chat': await updateChat(); break
  }
}

// ── Boot sequence (internal API is always available) ──

async function boot () {
  console.log('[app] Booting Oikos Companion...')

  // 1. Wait briefly for bare-http1 internal API
  let ready = false
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(API_BASE + '/api/health')
      if (res.ok) {
        ready = true
        console.log('[app] Internal API ready.')
        break
      }
    } catch {
      // bare-http1 not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  if (!ready) {
    console.error('[app] Internal API not responding.')
    document.getElementById('content').innerHTML = '<div style="padding:3rem;text-align:center;"><div style="font-size:1.5rem;font-weight:700;color:var(--red);margin-bottom:1rem;">Internal Error</div><div style="color:var(--muted);">Internal API not available. Try restarting the app.</div></div>'
    return
  }

  // 2. Fetch initial prices
  await fetchPrices()

  // 3. Initial render
  await updateCurrentView()

  // 4. Start refresh loop (2 seconds)
  refreshInterval = setInterval(updateCurrentView, 2000)

  // 5. Price refresh (60 seconds)
  setInterval(fetchPrices, 60000)

  console.log('[app] Oikos Companion ready.')
}

boot()
