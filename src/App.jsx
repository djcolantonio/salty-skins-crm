import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from './supabaseClient'

/* ============================================================
   Salty Skins Retreats — Operations CRM
   Single-file app: retreats, attendees + flights, expenses, todos.
   Pattern matches SafeHavenCRM: one App.jsx, Supabase for data.
   ============================================================ */

// Where the "Blog" nav item sends you to create a new post — the embedded
// Sanity Studio's create-new-document intent link for the "post" type, on
// the marketing site. Configurable via env so it can move (e.g. once the
// custom domain is live) without a code change.
const BLOG_STUDIO_CREATE_URL =
  import.meta.env.VITE_BLOG_STUDIO_URL ||
  'https://site-rho-five-7qjhp19rc8.vercel.app/studio/intent/create/type=post'

const RETREAT_STATUSES = ['planning', 'open', 'full', 'completed', 'cancelled']
const PAYMENT_STATUSES = ['pending', 'deposit', 'paid']
const PRIORITIES = ['low', 'medium', 'high']
const EXPENSE_CATEGORIES = [
  'venue', 'flights', 'food', 'instructors', 'marketing', 'supplies', 'insurance', 'other',
]

function money(n) {
  const v = Number(n || 0)
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/* ---------------- Auth Gate (real Supabase login) ---------------- */
function Gate({ authError, onSubmit }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    await onSubmit(email, password)
    setBusy(false)
  }

  return (
    <div className="gate">
      <form className="gate-box" onSubmit={submit}>
        <h1>Salty Skins</h1>
        <p>Retreat operations</p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="btn clay" style={{ width: '100%' }} type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {authError && <div className="error-text">{authError}</div>}
      </form>
    </div>
  )
}

/* ---------------- Generic Modal ---------------- */
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

/* ============================================================
   RETREATS
   ============================================================ */
function RetreatForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial || {
    name: '', location: '', start_date: '', end_date: '',
    price: '', capacity: '', description: '', status: 'planning',
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  function submit(e) {
    e.preventDefault()
    onSave({
      ...f,
      price: f.price === '' ? null : Number(f.price),
      capacity: f.capacity === '' ? null : parseInt(f.capacity, 10),
      start_date: f.start_date || null,
      end_date: f.end_date || null,
    })
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div className="field-group full">
          <label>Retreat name</label>
          <input value={f.name} onChange={set('name')} required placeholder="Amalfi Coast Reset" />
        </div>
        <div className="field-group full">
          <label>Location</label>
          <input value={f.location} onChange={set('location')} placeholder="Praiano, Italy" />
        </div>
        <div className="field-group">
          <label>Start date</label>
          <input type="date" value={f.start_date || ''} onChange={set('start_date')} />
        </div>
        <div className="field-group">
          <label>End date</label>
          <input type="date" value={f.end_date || ''} onChange={set('end_date')} />
        </div>
        <div className="field-group">
          <label>Price per person</label>
          <input type="number" step="0.01" value={f.price} onChange={set('price')} placeholder="2400" />
        </div>
        <div className="field-group">
          <label>Capacity</label>
          <input type="number" value={f.capacity} onChange={set('capacity')} placeholder="16" />
        </div>
        <div className="field-group">
          <label>Status</label>
          <select value={f.status} onChange={set('status')}>
            {RETREAT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field-group full">
          <label>Description</label>
          <textarea value={f.description || ''} onChange={set('description')} placeholder="Notes about the trip, theme, accommodations..." />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn clay">Save retreat</button>
      </div>
    </form>
  )
}

function RetreatsView({ retreats, loading, onCreate, onUpdate, onDelete, activeRetreatId, onSelectRetreat }) {
  const [editing, setEditing] = useState(null) // null | 'new' | retreat object
  const [confirmDelete, setConfirmDelete] = useState(null)

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Retreats</h2>
          <div className="section-sub">{retreats.length} total</div>
        </div>
        <button className="btn clay" onClick={() => setEditing('new')}>+ New retreat</button>
      </div>

      {loading ? (
        <div className="loading-state">Loading retreats…</div>
      ) : retreats.length === 0 ? (
        <div className="empty-state">No retreats yet. Create your first one to start tracking guests, expenses, and tasks.</div>
      ) : (
        <div className="card-grid">
          {retreats.map((r) => (
            <div key={r.id} className={`card ${activeRetreatId === r.id ? 'selected' : ''}`}>
              <span className={`badge ${r.status}`}>{r.status}</span>
              <h3 style={{ marginTop: 8 }}>{r.name}</h3>
              <div className="meta-row">
                <span>{r.location || 'No location set'}</span>
                <span>{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</span>
              </div>
              <div className="meta-row">
                <span>{r.price != null ? `${money(r.price)}/person` : 'No price set'}</span>
                <span>{r.capacity != null ? `Cap ${r.capacity}` : ''}</span>
              </div>
              {r.description && <div className="desc">{r.description}</div>}
              <div className="card-actions">
                <button className="btn sm secondary" onClick={() => onSelectRetreat(r.id === activeRetreatId ? null : r.id)}>
                  {activeRetreatId === r.id ? 'Viewing' : 'View data'}
                </button>
                <button className="btn sm ghost" onClick={() => setEditing(r)}>Edit</button>
                <button className="btn sm danger" onClick={() => setConfirmDelete(r)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New retreat' : 'Edit retreat'} onClose={() => setEditing(null)}>
          <RetreatForm
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSave={async (data) => {
              if (editing === 'new') await onCreate(data)
              else await onUpdate(editing.id, data)
              setEditing(null)
            }}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete retreat?" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 14 }}>
            This will delete <strong>{confirmDelete.name}</strong> and all of its guests and tasks. Expenses linked to it will be kept but unlinked. This can't be undone.
          </p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null) }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ============================================================
   ATTENDEES
   ============================================================ */
function AttendeeForm({ initial, retreats, defaultRetreatId, onSave, onCancel }) {
  const [f, setF] = useState(initial || {
    retreat_id: defaultRetreatId || (retreats[0] && retreats[0].id) || '',
    name: '', email: '', phone: '',
    arrival_airline: '', arrival_flight_number: '', arrival_datetime: '', arrival_airport: '',
    departure_airline: '', departure_flight_number: '', departure_datetime: '', departure_airport: '',
    payment_status: 'pending', amount_paid: '',
    dietary_notes: '', notes: '',
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  function submit(e) {
    e.preventDefault()
    onSave({
      ...f,
      amount_paid: f.amount_paid === '' ? 0 : Number(f.amount_paid),
      arrival_datetime: f.arrival_datetime || null,
      departure_datetime: f.departure_datetime || null,
    })
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div className="field-group full">
          <label>Retreat</label>
          <select value={f.retreat_id} onChange={set('retreat_id')} required>
            <option value="" disabled>Select a retreat</option>
            {retreats.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label>Full name</label>
          <input value={f.name} onChange={set('name')} required />
        </div>
        <div className="field-group">
          <label>Email</label>
          <input type="email" value={f.email} onChange={set('email')} />
        </div>
        <div className="field-group">
          <label>Phone</label>
          <input value={f.phone} onChange={set('phone')} />
        </div>
        <div className="field-group">
          <label>Payment status</label>
          <select value={f.payment_status} onChange={set('payment_status')}>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field-group full">
          <label>Amount paid</label>
          <input type="number" step="0.01" value={f.amount_paid} onChange={set('amount_paid')} />
        </div>

        <fieldset>
          <legend>Arrival flight</legend>
          <div className="form-grid">
            <div className="field-group"><label>Airline</label><input value={f.arrival_airline} onChange={set('arrival_airline')} /></div>
            <div className="field-group"><label>Flight #</label><input value={f.arrival_flight_number} onChange={set('arrival_flight_number')} /></div>
            <div className="field-group"><label>Arrival date/time</label><input type="datetime-local" value={f.arrival_datetime} onChange={set('arrival_datetime')} /></div>
            <div className="field-group"><label>Arrival airport</label><input value={f.arrival_airport} onChange={set('arrival_airport')} placeholder="NAP" /></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Departure flight</legend>
          <div className="form-grid">
            <div className="field-group"><label>Airline</label><input value={f.departure_airline} onChange={set('departure_airline')} /></div>
            <div className="field-group"><label>Flight #</label><input value={f.departure_flight_number} onChange={set('departure_flight_number')} /></div>
            <div className="field-group"><label>Departure date/time</label><input type="datetime-local" value={f.departure_datetime} onChange={set('departure_datetime')} /></div>
            <div className="field-group"><label>Departure airport</label><input value={f.departure_airport} onChange={set('departure_airport')} placeholder="JFK" /></div>
          </div>
        </fieldset>

        <div className="field-group full">
          <label>Dietary / allergies</label>
          <input value={f.dietary_notes} onChange={set('dietary_notes')} placeholder="Vegetarian, shellfish allergy..." />
        </div>
        <div className="field-group full">
          <label>Notes</label>
          <textarea value={f.notes || ''} onChange={set('notes')} />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn clay">Save guest</button>
      </div>
    </form>
  )
}

function AttendeesView({ attendees, retreats, loading, activeRetreatId, onCreate, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const retreatName = (id) => (retreats.find((r) => r.id === id) || {}).name || '—'

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Guests</h2>
          <div className="section-sub">
            {attendees.length} {activeRetreatId ? 'for selected retreat' : 'across all retreats'}
          </div>
        </div>
        <button className="btn clay" disabled={retreats.length === 0} onClick={() => setEditing('new')}>+ Add guest</button>
      </div>

      {retreats.length === 0 ? (
        <div className="empty-state">Create a retreat first, then add guests to it.</div>
      ) : loading ? (
        <div className="loading-state">Loading guests…</div>
      ) : attendees.length === 0 ? (
        <div className="empty-state">No guests yet for this view.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                {!activeRetreatId && <th>Retreat</th>}
                <th>Contact</th>
                <th>Payment</th>
                <th className="num">Paid</th>
                <th>Flights</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {attendees.map((a) => (
                <React.Fragment key={a.id}>
                  <tr>
                    <td><strong>{a.name}</strong></td>
                    {!activeRetreatId && <td>{retreatName(a.retreat_id)}</td>}
                    <td>
                      <div>{a.email || '—'}</div>
                      <div className="subtext">{a.phone || ''}</div>
                    </td>
                    <td><span className={`badge ${a.payment_status}`}>{a.payment_status}</span></td>
                    <td className="num">{money(a.amount_paid)}</td>
                    <td>
                      <button className="btn sm ghost" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                        {expandedId === a.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn sm secondary" onClick={() => setEditing(a)}>Edit</button>
                        <button className="btn sm danger" onClick={() => setConfirmDelete(a)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === a.id && (
                    <tr>
                      <td colSpan={activeRetreatId ? 5 : 6} style={{ background: 'rgba(95,143,138,0.06)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
                          <div>
                            <div className="subtext" style={{ marginBottom: 4 }}>ARRIVAL</div>
                            {a.arrival_airline || a.arrival_flight_number ? (
                              <div>{a.arrival_airline} {a.arrival_flight_number} → {a.arrival_airport || '?'}<br /><span className="subtext">{fmtDateTime(a.arrival_datetime)}</span></div>
                            ) : <div className="subtext">Not provided</div>}
                          </div>
                          <div>
                            <div className="subtext" style={{ marginBottom: 4 }}>DEPARTURE</div>
                            {a.departure_airline || a.departure_flight_number ? (
                              <div>{a.departure_airline} {a.departure_flight_number} → {a.departure_airport || '?'}<br /><span className="subtext">{fmtDateTime(a.departure_datetime)}</span></div>
                            ) : <div className="subtext">Not provided</div>}
                          </div>
                          {a.dietary_notes && <div><div className="subtext">DIETARY</div>{a.dietary_notes}</div>}
                          {a.notes && <div><div className="subtext">NOTES</div>{a.notes}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Add guest' : 'Edit guest'} onClose={() => setEditing(null)}>
          <AttendeeForm
            initial={editing === 'new' ? null : editing}
            retreats={retreats}
            defaultRetreatId={activeRetreatId}
            onCancel={() => setEditing(null)}
            onSave={async (data) => {
              if (editing === 'new') await onCreate(data)
              else await onUpdate(editing.id, data)
              setEditing(null)
            }}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete guest?" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 14 }}>Remove <strong>{confirmDelete.name}</strong>? This can't be undone.</p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null) }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ============================================================
   FLIGHTS
   ============================================================ */
function FlightsView({ attendees, retreats, loading, activeRetreatId }) {
  const retreatName = (id) => (retreats.find((r) => r.id === id) || {}).name || '—'

  const sorted = useMemo(() => {
    return [...attendees].sort((a, b) => {
      const da = a.arrival_datetime ? new Date(a.arrival_datetime).getTime() : Infinity
      const db = b.arrival_datetime ? new Date(b.arrival_datetime).getTime() : Infinity
      if (da !== db) return da - db
      return a.name.localeCompare(b.name)
    })
  }, [attendees])

  const flightLine = (airline, flightNum, airport, when) => {
    const parts = [airline, flightNum, airport].filter(Boolean)
    if (parts.length === 0 && !when) return '—'
    return (
      <>
        <div>{parts.length ? parts.join(' · ') : 'Flight details TBD'}</div>
        {when && <div className="subtext">{fmtDateTime(when)}</div>}
      </>
    )
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Flights</h2>
          <div className="section-sub">{attendees.length} guests {activeRetreatId ? 'for selected retreat' : 'across all retreats'}</div>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading flights…</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">No guests yet — add guests to see their flight details here.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Guest</th>
                {!activeRetreatId && <th>Retreat</th>}
                <th>Arrival</th>
                <th>Departure</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong></td>
                  {!activeRetreatId && <td>{retreatName(a.retreat_id)}</td>}
                  <td>{flightLine(a.arrival_airline, a.arrival_flight_number, a.arrival_airport, a.arrival_datetime)}</td>
                  <td>{flightLine(a.departure_airline, a.departure_flight_number, a.departure_airport, a.departure_datetime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   EXPENSES
   ============================================================ */
function ExpenseForm({ initial, retreats, defaultRetreatId, onSave, onCancel }) {
  const [f, setF] = useState(initial || {
    retreat_id: defaultRetreatId || '', category: 'other', description: '',
    amount: '', expense_date: new Date().toISOString().slice(0, 10), paid_by: '', reimbursed: false,
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  function submit(e) {
    e.preventDefault()
    onSave({ ...f, retreat_id: f.retreat_id || null, amount: Number(f.amount || 0), expense_date: f.expense_date || null })
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div className="field-group full">
          <label>Retreat (optional — leave blank for general/overhead expense)</label>
          <select value={f.retreat_id} onChange={set('retreat_id')}>
            <option value="">General / not retreat-specific</option>
            {retreats.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label>Category</label>
          <select value={f.category} onChange={set('category')}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label>Amount</label>
          <input type="number" step="0.01" value={f.amount} onChange={set('amount')} required />
        </div>
        <div className="field-group full">
          <label>Description</label>
          <input value={f.description} onChange={set('description')} placeholder="Deposit for villa rental" />
        </div>
        <div className="field-group">
          <label>Date</label>
          <input type="date" value={f.expense_date || ''} onChange={set('expense_date')} />
        </div>
        <div className="field-group">
          <label>Paid by</label>
          <input value={f.paid_by} onChange={set('paid_by')} placeholder="Daniel, business card, etc." />
        </div>
        <div className="field-group full" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={!!f.reimbursed} onChange={(e) => setF({ ...f, reimbursed: e.target.checked })} id="reimbursed" />
          <label htmlFor="reimbursed" style={{ margin: 0 }}>Reimbursed</label>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn clay">Save expense</button>
      </div>
    </form>
  )
}

function ExpensesView({ expenses, attendees, retreats, loading, activeRetreatId, onCreate, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount || 0), 0), [expenses])
  const totalIncome = useMemo(() => attendees.reduce((s, a) => s + Number(a.amount_paid || 0), 0), [attendees])
  const net = totalIncome - totalExpenses
  const unreimbursed = useMemo(
    () => expenses.filter((e) => !e.reimbursed).reduce((s, e) => s + Number(e.amount || 0), 0),
    [expenses]
  )
  const retreatName = (id) => (retreats.find((r) => r.id === id) || {}).name || 'General'

  const chartData = [
    { name: 'Income', amount: totalIncome },
    { name: 'Expenses', amount: totalExpenses },
  ]

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Bookkeeping</h2>
          <div className="section-sub">
            Income from guest payments · {expenses.length} expense entries {activeRetreatId ? 'for selected retreat' : 'across all retreats'}
          </div>
        </div>
        <button className="btn clay" onClick={() => setEditing('new')}>+ Add expense</button>
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">Income (collected)</div><div className="value good">{money(totalIncome)}</div></div>
        <div className="stat"><div className="label">Total expenses</div><div className="value">{money(totalExpenses)}</div></div>
        <div className="stat"><div className="label">Net</div><div className={`value ${net >= 0 ? 'good' : 'bad'}`}>{money(net)}</div></div>
        <div className="stat"><div className="label">Unreimbursed</div><div className={`value ${unreimbursed > 0 ? 'bad' : 'good'}`}>{money(unreimbursed)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 22, height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ddd3bf" />
            <XAxis dataKey="name" tick={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fill: '#6b6357' }} />
            <YAxis tick={{ fontFamily: 'DM Mono, monospace', fontSize: 11, fill: '#6b6357' }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip
              formatter={(value) => money(value)}
              contentStyle={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, border: '1px solid #ddd3bf', borderRadius: 8 }}
            />
            <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={entry.name} fill={i === 0 ? '#4b7a5a' : '#a8493a'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {loading ? (
        <div className="loading-state">Loading expenses…</div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">No expenses logged yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                {!activeRetreatId && <th>Retreat</th>}
                <th>Category</th>
                <th>Paid by</th>
                <th className="num">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.expense_date)}</td>
                  <td>
                    {e.description}
                    {!e.reimbursed && <div className="subtext" style={{ color: 'var(--bad)' }}>not reimbursed</div>}
                  </td>
                  {!activeRetreatId && <td>{retreatName(e.retreat_id)}</td>}
                  <td><span className="badge planning">{e.category}</span></td>
                  <td>{e.paid_by || '—'}</td>
                  <td className="num">{money(e.amount)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn sm secondary" onClick={() => setEditing(e)}>Edit</button>
                      <button className="btn sm danger" onClick={() => setConfirmDelete(e)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Add expense' : 'Edit expense'} onClose={() => setEditing(null)}>
          <ExpenseForm
            initial={editing === 'new' ? null : editing}
            retreats={retreats}
            defaultRetreatId={activeRetreatId}
            onCancel={() => setEditing(null)}
            onSave={async (data) => {
              if (editing === 'new') await onCreate(data)
              else await onUpdate(editing.id, data)
              setEditing(null)
            }}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete expense?" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 14 }}>Remove "{confirmDelete.description}" ({money(confirmDelete.amount)})?</p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null) }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ============================================================
   TODOS
   ============================================================ */
function TodoForm({ initial, retreats, defaultRetreatId, onSave, onCancel }) {
  const [f, setF] = useState(initial || {
    retreat_id: defaultRetreatId || '', task: '', due_date: '', priority: 'medium',
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  function submit(e) {
    e.preventDefault()
    onSave({ ...f, retreat_id: f.retreat_id || null, due_date: f.due_date || null })
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div className="field-group full">
          <label>Task</label>
          <input value={f.task} onChange={set('task')} required placeholder="Confirm airport shuttle vendor" />
        </div>
        <div className="field-group full">
          <label>Retreat (optional)</label>
          <select value={f.retreat_id} onChange={set('retreat_id')}>
            <option value="">General</option>
            {retreats.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label>Due date</label>
          <input type="date" value={f.due_date || ''} onChange={set('due_date')} />
        </div>
        <div className="field-group">
          <label>Priority</label>
          <select value={f.priority} onChange={set('priority')}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn clay">Save task</button>
      </div>
    </form>
  )
}

function TodosView({ todos, retreats, loading, activeRetreatId, onCreate, onToggle, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [hideCompleted, setHideCompleted] = useState(false)

  const retreatName = (id) => (retreats.find((r) => r.id === id) || {}).name || 'General'
  const visible = hideCompleted ? todos.filter((t) => !t.done) : todos
  const sorted = [...visible].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity
    return da - db
  })

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Tasks</h2>
          <div className="section-sub">{todos.filter((t) => !t.done).length} open · {todos.length} total</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => setHideCompleted(!hideCompleted)}>
            {hideCompleted ? 'Show completed' : 'Hide completed'}
          </button>
          <button className="btn clay" onClick={() => setEditing('new')}>+ Add task</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading tasks…</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">Nothing on the list. Add a task to get started.</div>
      ) : (
        <div className="table-wrap">
          {sorted.map((t) => (
            <div key={t.id} className={`todo-row ${t.done ? 'done' : ''}`}>
              <button className="todo-check" onClick={() => onToggle(t.id, !t.done)}>{t.done ? '✓' : ''}</button>
              <div style={{ flex: 1 }}>
                <div className="task-text">{t.task}</div>
                <div className="task-meta">
                  {!activeRetreatId && <span>{retreatName(t.retreat_id)}</span>}
                  {t.due_date && <span>Due {fmtDate(t.due_date)}</span>}
                  <span className={`badge ${t.priority}`}>{t.priority}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn sm secondary" onClick={() => setEditing(t)}>Edit</button>
                <button className="btn sm danger" onClick={() => setConfirmDelete(t)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Add task' : 'Edit task'} onClose={() => setEditing(null)}>
          <TodoForm
            initial={editing === 'new' ? null : editing}
            retreats={retreats}
            defaultRetreatId={activeRetreatId}
            onCancel={() => setEditing(null)}
            onSave={async (data) => {
              if (editing === 'new') await onCreate(data)
              else await onUpdate(editing.id, data)
              setEditing(null)
            }}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete task?" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 14 }}>Remove "{confirmDelete.task}"?</p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null) }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ============================================================
   NOTES
   ============================================================ */
function NoteForm({ initial, retreats, defaultRetreatId, onSave, onCancel }) {
  const [f, setF] = useState(initial || { retreat_id: defaultRetreatId || '', content: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  function submit(e) {
    e.preventDefault()
    onSave({ ...f, retreat_id: f.retreat_id || null })
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div className="field-group full">
          <label>Retreat (optional)</label>
          <select value={f.retreat_id} onChange={set('retreat_id')}>
            <option value="">General</option>
            {retreats.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field-group full">
          <label>Note</label>
          <textarea value={f.content} onChange={set('content')} required style={{ minHeight: 140 }} autoFocus />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn clay">Save note</button>
      </div>
    </form>
  )
}

function NotesView({ notes, retreats, loading, activeRetreatId, onCreate, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  const retreatName = (id) => (retreats.find((r) => r.id === id) || {}).name || 'General'
  const sorted = [...notes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Notes</h2>
          <div className="section-sub">{notes.length} {activeRetreatId ? 'for selected retreat' : 'across all retreats'}</div>
        </div>
        <button className="btn clay" onClick={() => setEditing('new')}>+ Add note</button>
      </div>

      {loading ? (
        <div className="loading-state">Loading notes…</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">No notes yet.</div>
      ) : (
        <div className="card-grid notes-grid">
          {sorted.map((n) => {
            const isExpanded = expandedIds.has(n.id)
            const isLong = (n.content || '').length > 240
            return (
              <div key={n.id} className="card note-card">
                <div className="meta-row">
                  {!activeRetreatId && <span>{retreatName(n.retreat_id)}</span>}
                  <span>{fmtDate(n.created_at)}</span>
                </div>
                <div
                  className={`desc${isLong && !isExpanded ? ' clamped' : ''}`}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {n.content}
                </div>
                {isLong && (
                  <button type="button" className="expand-toggle" onClick={() => toggleExpanded(n.id)}>
                    {isExpanded ? 'Show less ^' : 'Show more v'}
                  </button>
                )}
                <div className="card-actions">
                  <button className="btn sm secondary" onClick={() => setEditing(n)}>Edit</button>
                  <button className="btn sm danger" onClick={() => setConfirmDelete(n)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Add note' : 'Edit note'} onClose={() => setEditing(null)}>
          <NoteForm
            initial={editing === 'new' ? null : editing}
            retreats={retreats}
            defaultRetreatId={activeRetreatId}
            onCancel={() => setEditing(null)}
            onSave={async (data) => {
              if (editing === 'new') await onCreate(data)
              else await onUpdate(editing.id, data)
              setEditing(null)
            }}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete note?" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 14 }}>Remove this note? This can't be undone.</p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null) }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ============================================================
   LEADS & SUBSCRIBERS (populated by the marketing site's
   contact form and newsletter signup — Supabase inserts land
   here directly, this UI is read/triage only)
   ============================================================ */
function CopyAllButton({ emails }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(emails.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can be unavailable in some contexts — fail silently.
    }
  }
  return (
    <button className="btn sm secondary" onClick={copy} disabled={emails.length === 0}>
      {copied ? 'Copied!' : 'Copy all emails'}
    </button>
  )
}

function LeadsView({ leads, loading, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(null)
  const sorted = [...leads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const emails = sorted.map((l) => l.email).filter(Boolean)

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Leads</h2>
          <div className="section-sub">{leads.length} from the contact form</div>
        </div>
        <CopyAllButton emails={emails} />
      </div>

      {loading ? (
        <div className="loading-state">Loading leads…</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">No leads yet — they'll show up here when someone uses the contact form on the site.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Message</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.name || '—'}</strong></td>
                  <td>{l.email}</td>
                  <td style={{ maxWidth: 320, whiteSpace: 'pre-wrap' }}>{l.message || '—'}</td>
                  <td className="subtext">{fmtDate(l.created_at)}</td>
                  <td><button className="btn sm danger" onClick={() => setConfirmDelete(l)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <Modal title="Delete lead?" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 14 }}>Remove {confirmDelete.email}? This can't be undone.</p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null) }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SubscribersView({ subscribers, loading, onDelete, onBulkImport }) {
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const sorted = [...subscribers].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const emails = sorted.map((s) => s.email).filter(Boolean)

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Subscribers</h2>
          <div className="section-sub">{subscribers.length} on the mailing list</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn sm secondary" onClick={() => setShowImport(true)}>Bulk import</button>
          <CopyAllButton emails={emails} />
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading subscribers…</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">No subscribers yet — they'll show up here when someone signs up on the site.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((sub) => (
                <tr key={sub.id}>
                  <td>{sub.email}</td>
                  <td className="subtext">{fmtDate(sub.created_at)}</td>
                  <td><button className="btn sm danger" onClick={() => setConfirmDelete(sub)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <Modal title="Remove subscriber?" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 14 }}>Remove {confirmDelete.email}? This can't be undone.</p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null) }}>Delete</button>
          </div>
        </Modal>
      )}

      {showImport && (
        <BulkImportSubscribersModal onClose={() => setShowImport(false)} onImport={onBulkImport} />
      )}
    </div>
  )
}

function BulkImportSubscribersModal({ onClose, onImport }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const { valid, invalidCount } = useMemo(() => {
    const raw = text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    const unique = [...new Set(raw)]
    const validEmails = unique.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    return { valid: validEmails, invalidCount: unique.length - validEmails.length }
  }, [text])

  async function submit() {
    setBusy(true)
    const summary = await onImport(valid)
    setResult(summary)
    setBusy(false)
  }

  return (
    <Modal title="Bulk import subscribers" onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        Paste emails below — one per line, or separated by commas or spaces. Anyone already on the list is skipped automatically.
      </p>
      <textarea
        rows={8}
        style={{ width: '100%', marginTop: 10 }}
        placeholder={'jane@example.com\njohn@example.com'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy || !!result}
      />
      <div className="section-sub" style={{ marginTop: 8 }}>
        {valid.length} valid email{valid.length === 1 ? '' : 's'} found
        {invalidCount > 0 ? `, ${invalidCount} skipped (not a valid email)` : ''}
      </div>

      {result && (
        <div className="empty-state" style={{ marginTop: 12 }}>
          Added {result.added} new subscriber{result.added === 1 ? '' : 's'}
          {result.skipped > 0 ? ` — ${result.skipped} were already on the list.` : '.'}
        </div>
      )}

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="btn ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
        {!result && (
          <button className="btn solid" onClick={submit} disabled={busy || valid.length === 0}>
            {busy ? 'Importing…' : `Import ${valid.length || ''}`}
          </button>
        )}
      </div>
    </Modal>
  )
}

/* ============================================================
   APPLICATIONS (populated by the marketing site's retreat
   application form — Supabase inserts land here directly)
   ============================================================ */
const APPLICATION_STATUSES = ['new', 'contacted', 'confirmed', 'declined']

const LOOKING_FORWARD_LABELS = {
  practice: 'Deepening yoga & movement practice',
  'rest-connection': 'Rest, connection, and community',
  adventure: 'Adventure and exploring somewhere new',
  mix: 'A mix of all of the above',
}

const ALCOHOL_LABELS = { yes: 'Yes', no: 'No', unsure: 'Unsure' }

function ApplicationDetails({ app }) {
  const rows = [
    ['Phone', app.phone],
    ['Date of birth', app.date_of_birth],
    ['Instagram', app.instagram],
    ['Retreat', app.retreat],
    ['Room preference', app.room_preference],
    ['Experience level', app.experience_level],
    ['Dietary restrictions / allergies', app.dietary],
    [
      'Emergency contact',
      app.emergency_contact_name || app.emergency_contact_phone
        ? [app.emergency_contact_name, app.emergency_contact_phone].filter(Boolean).join(' — ')
        : null,
    ],
    ['How they heard about us', app.referral_source],
    ['Notes', app.notes],
    ['Most looking forward to', LOOKING_FORWARD_LABELS[app.primary_motivation] || app.primary_motivation],
    ['What they hope to get out of it', app.experience_goals],
    ['Plans to drink alcohol', ALCOHOL_LABELS[app.alcohol_plans] || app.alcohol_plans],
    ['Acknowledged retreat culture/values', app.culture_acknowledged ? 'Yes' : 'No'],
    ['Waiver acknowledged', app.waiver_acknowledged ? 'Yes' : 'No'],
  ]
  return (
    <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
      {rows.filter(([, v]) => v).map(([label, value]) => (
        <div key={label}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)' }}>{label}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function ApplicationsView({ applications, loading, onUpdateStatus, onDelete }) {
  const [viewing, setViewing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const sorted = [...applications].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const emails = sorted.map((a) => a.email).filter(Boolean)

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Applications</h2>
          <div className="section-sub">{applications.length} retreat application{applications.length === 1 ? '' : 's'}</div>
        </div>
        <CopyAllButton emails={emails} />
      </div>

      {loading ? (
        <div className="loading-state">Loading applications…</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">No applications yet — they'll show up here when someone applies on the site.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Retreat</th>
                <th>Alcohol</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.full_name}</strong></td>
                  <td>{a.email}</td>
                  <td>{a.retreat}</td>
                  <td>
                    {a.alcohol_plans === 'yes' ? (
                      <span className="badge" style={{ background: '#f3e3c9', color: '#8a5a1e' }}>Yes</span>
                    ) : (ALCOHOL_LABELS[a.alcohol_plans] || '—')}
                  </td>
                  <td>
                    <select
                      value={a.status}
                      onChange={(e) => onUpdateStatus(a.id, e.target.value)}
                      style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }}
                    >
                      {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="subtext">{fmtDate(a.created_at)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm secondary" onClick={() => setViewing(a)}>View</button>
                    <button className="btn sm danger" onClick={() => setConfirmDelete(a)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <Modal title={viewing.full_name} onClose={() => setViewing(null)}>
          <ApplicationDetails app={viewing} />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete application?" onClose={() => setConfirmDelete(null)}>
          <p style={{ fontSize: 14 }}>Remove {confirmDelete.full_name}'s application? This can't be undone.</p>
          <div className="form-actions">
            <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null) }}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ============================================================
   ICONS (minimal line icons for the sidebar nav)
   ============================================================ */
const iconProps = { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
const OverviewIcon = () => (<svg {...iconProps}><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" /></svg>)
const RetreatsIcon = () => (<svg {...iconProps}><path d="M4 8.5 10 4l6 4.5" /><path d="M5.5 8v7.5h9V8" /><path d="M8.3 15.5v-4h3.4v4" /></svg>)
const GuestsIcon = () => (<svg {...iconProps}><circle cx="7.5" cy="7" r="2.6" /><path d="M2.8 16c.6-2.7 2.4-4.2 4.7-4.2S11.8 13.3 12.4 16" /><circle cx="14.2" cy="7.6" r="2" /><path d="M13 11.9c1.9.2 3.2 1.6 3.7 4" /></svg>)
const FlightsIcon = () => (<svg {...iconProps}><path d="M11.2 3.3a1.2 1.2 0 0 1 2 .9v4l4.3 2.7v1.6l-4.3-1.2v3.6l1.6 1.2v1.3l-2.8-.8-2.8.8v-1.3l1.6-1.2v-3.6l-4.3 1.2v-1.6L11 8.2v-4c0-.36.08-.68.2-.9z" /></svg>)
const FinancesIcon = () => (<svg {...iconProps}><rect x="3" y="4" width="4" height="12" rx="0.8" /><rect x="8.5" y="8" width="4" height="8" rx="0.8" /><rect x="14" y="6" width="3" height="10" rx="0.8" /></svg>)
const TasksIcon = () => (<svg {...iconProps}><path d="M4 10.5l3 3 8-8" /></svg>)
const NotesIcon = () => (<svg {...iconProps}><path d="M4 3.5h9L16 6.5V16.5H4z" /><path d="M13 3.5V7h3" /><path d="M6.5 10h5M6.5 12.5h5" /></svg>)
const LeadsIcon = () => (<svg {...iconProps}><rect x="3" y="5" width="14" height="10" rx="1.2" /><path d="M3.5 5.8 10 10.5l6.5-4.7" /></svg>)
const SubscribersIcon = () => (<svg {...iconProps}><path d="M10 4a3 3 0 0 0-3 3v2.5c0 1-.4 2-1.1 2.7L5 13h10l-.9-.8A3.8 3.8 0 0 1 13 9.5V7a3 3 0 0 0-3-3z" /><path d="M8.3 15.5a1.8 1.8 0 0 0 3.4 0" /></svg>)
const ApplicationsIcon = () => (<svg {...iconProps}><path d="M5 3.5h7l3 3V16.5H5z" /><path d="M12 3.5V7h3" /><path d="M7.2 10.2h5.6M7.2 12.7h5.6M7.2 15.2h3.4" /></svg>)
const BlogIcon = () => (<svg {...iconProps}><path d="M5 4.5h10v11H5z" /><path d="M7.3 8h5.4M7.3 10.5h5.4M7.3 13h3.4" /><path d="M13.5 4.5 15.5 6.5" /></svg>)

const TAB_META = {
  overview: { label: 'Overview', icon: OverviewIcon, eyebrow: 'Today', title: 'Overview' },
  leads: { label: 'Leads', icon: LeadsIcon, eyebrow: 'Contact form', title: 'Leads' },
  subscribers: { label: 'Subscribers', icon: SubscribersIcon, eyebrow: 'Mailing list', title: 'Subscribers' },
  applications: { label: 'Applications', icon: ApplicationsIcon, eyebrow: 'Retreat applications', title: 'Applications' },
  retreats: { label: 'Retreats', icon: RetreatsIcon, eyebrow: 'Trips', title: 'Retreats' },
  attendees: { label: 'Guests', icon: GuestsIcon, eyebrow: 'Roster', title: 'Guests' },
  flights: { label: 'Flights', icon: FlightsIcon, eyebrow: 'Travel', title: 'Flights' },
  expenses: { label: 'Finances', icon: FinancesIcon, eyebrow: 'Bookkeeping', title: 'Finances' },
  todos: { label: 'Tasks', icon: TasksIcon, eyebrow: 'Follow-through', title: 'Tasks' },
  notes: { label: 'Notes', icon: NotesIcon, eyebrow: 'Freeform', title: 'Notes' },
  // Not an internal view — clicking this opens the blog's "new post" editor
  // in a new tab, so writing a post is reachable from the same nav without
  // duplicating the Studio's editing UI inside this app.
  blog: { label: 'Blog', icon: BlogIcon, external: BLOG_STUDIO_CREATE_URL },
}

function daysAway(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const today = new Date()
  target.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((target - today) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return 'Today'
  if (diff === 1) return '1 day away'
  return `${diff} days away`
}

function dueLabel(dateStr) {
  if (!dateStr) return 'No due date'
  const target = new Date(dateStr)
  const today = new Date()
  target.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((target - today) / 86400000)
  if (diff < 0) return 'Overdue'
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  return `Due ${fmtDate(dateStr)}`
}

function greetingName(email) {
  if (!email) return 'there'
  const local = email.split('@')[0]
  const first = local.split(/[._-]/)[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

function initialsFromEmail(email) {
  if (!email) return '?'
  const local = email.split('@')[0]
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

function greetingTime() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/* ============================================================
   OVERVIEW
   ============================================================ */
function OverviewView({ retreats, attendees, expenses, todos, userEmail, activeRetreatId, onToggleTodo, onGoToTab, onSelectRetreat }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const featured = useMemo(() => {
    if (activeRetreatId) return retreats.find((r) => r.id === activeRetreatId) || null
    if (retreats.length === 0) return null
    const ongoing = retreats.find((r) => r.start_date && r.end_date && new Date(r.start_date) <= today && new Date(r.end_date) >= today)
    if (ongoing) return ongoing
    const upcoming = retreats
      .filter((r) => r.start_date && new Date(r.start_date) >= today)
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    if (upcoming.length > 0) return upcoming[0]
    return [...retreats].sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0))[0]
  }, [retreats, activeRetreatId])

  const retreatAttendees = useMemo(
    () => (featured ? attendees.filter((a) => a.retreat_id === featured.id) : []),
    [attendees, featured]
  )
  const retreatExpenses = useMemo(
    () => (featured ? expenses.filter((e) => e.retreat_id === featured.id) : []),
    [expenses, featured]
  )

  const price = Number(featured?.price || 0)
  const guestsConfirmed = retreatAttendees.length
  const capacity = featured?.capacity ?? null
  const expectedIncome = guestsConfirmed * price
  const collected = retreatAttendees.reduce((s, a) => s + Number(a.amount_paid || 0), 0)
  const outstanding = Math.max(expectedIncome - collected, 0)
  const unpaidCount = price > 0 ? retreatAttendees.filter((a) => Number(a.amount_paid || 0) < price).length : 0
  const totalExpenses = retreatExpenses.reduce((s, e) => s + Number(e.amount || 0), 0)
  const profit = expectedIncome - totalExpenses
  const margin = expectedIncome > 0 ? (profit / expectedIncome) * 100 : null
  const capacityPct = capacity ? Math.min((guestsConfirmed / capacity) * 100, 100) : 0

  const priorities = useMemo(
    () => [...todos].filter((t) => !t.done).sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity
      return da - db
    }).slice(0, 5),
    [todos]
  )
  const upcomingRetreats = useMemo(
    () => retreats.filter((r) => r.id !== featured?.id).sort((a, b) => new Date(a.start_date || 0) - new Date(b.start_date || 0)).slice(0, 4),
    [retreats, featured]
  )

  const chartData = [
    { name: 'Income', amount: expectedIncome },
    { name: 'Costs', amount: totalExpenses },
  ]

  return (
    <div>
      <div className="page-eyebrow">{today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</div>
      <div className="overview-greeting-row">
        <h1 className="page-title">{greetingTime()}, {greetingName(userEmail)}.</h1>
        <div className="avatar-circle">{initialsFromEmail(userEmail)}</div>
      </div>

      {!featured ? (
        <div className="empty-state">No retreats yet — add one to see your overview.</div>
      ) : (
        <>
          <div className="hero-banner">
            <div className="hero-eyebrow">
              {featured.start_date && new Date(featured.start_date) <= today && new Date(featured.end_date) >= today ? 'Active retreat' : 'Upcoming retreat'}
            </div>
            <div className="hero-title">{featured.name}</div>
            <div className="hero-sub">
              {fmtDate(featured.start_date)} – {fmtDate(featured.end_date)}{featured.location ? ` · ${featured.location}` : ''}
            </div>
            {daysAway(featured.start_date) && <span className="hero-days-pill">{daysAway(featured.start_date)}</span>}
          </div>

          <div className="stat-strip">
            <div className="stat">
              <div className="label">Guests confirmed</div>
              <div className="value">{guestsConfirmed}{capacity != null && <span style={{ fontSize: 16, fontStyle: 'normal', color: 'var(--ink-soft)' }}> / {capacity}</span>}</div>
              <div className="section-sub">{capacity != null ? `${Math.max(capacity - guestsConfirmed, 0)} remaining spaces` : 'No capacity set'}</div>
              {capacity != null && <div className="progress-track"><div className="progress-fill" style={{ width: `${capacityPct}%` }} /></div>}
            </div>
            <div className="stat">
              <div className="label">Collected</div>
              <div className="value good">{money(collected)}</div>
              <div className="section-sub">{price > 0 ? `of ${money(expectedIncome)} expected` : 'No price set'}</div>
            </div>
            <div className="stat">
              <div className="label">Outstanding</div>
              <div className={`value ${outstanding > 0 ? 'bad' : 'good'}`}>{money(outstanding)}</div>
              <div className="section-sub">{unpaidCount} guest balance{unpaidCount === 1 ? '' : 's'}</div>
            </div>
            <div className="stat">
              <div className="label">Projected profit</div>
              <div className={`value ${profit >= 0 ? 'good' : 'bad'}`}>{money(profit)}</div>
              <div className="section-sub">{margin != null ? `${margin.toFixed(1)}% margin` : '—'}</div>
            </div>
          </div>

          <div className="overview-grid">
            <div className="card overview-panel">
              <div className="panel-head">
                <h3 className="panel-title">Today's priorities</h3>
                <button className="link-btn" onClick={() => onGoToTab('todos')}>All tasks</button>
              </div>
              {priorities.length === 0 ? (
                <div className="empty-state">Nothing pending.</div>
              ) : priorities.map((t) => (
                <div key={t.id} className="priority-row">
                  <button className="todo-check" onClick={() => onToggleTodo(t.id, true)} />
                  <div>
                    <div className="task-text">{t.task}</div>
                    <div className="task-meta"><span>{dueLabel(t.due_date)}</span><span className={`badge ${t.priority}`}>{t.priority}</span></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card overview-panel">
              <div className="panel-head">
                <h3 className="panel-title">Retreat financial health</h3>
                <span className="subtext">Projected</span>
              </div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6ddc7" />
                    <XAxis dataKey="name" tick={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fill: '#8a8172' }} />
                    <YAxis tick={{ fontFamily: 'DM Mono, monospace', fontSize: 11, fill: '#8a8172' }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                    <Tooltip formatter={(value) => money(value)} contentStyle={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, border: '1px solid #e6ddc7', borderRadius: 8 }} />
                    <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, i) => (<Cell key={entry.name} fill={i === 0 ? '#2f4a3d' : '#c1673f'} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card overview-panel" style={{ marginBottom: 16 }}>
            <div className="panel-head">
              <h3 className="panel-title">Upcoming retreats</h3>
              <button className="link-btn" onClick={() => onGoToTab('retreats')}>All retreats</button>
            </div>
            {upcomingRetreats.length === 0 ? (
              <div className="empty-state">Nothing else on the calendar.</div>
            ) : (
              <div className="card-grid" style={{ paddingBottom: 14 }}>
                {upcomingRetreats.map((r) => (
                  <button key={r.id} className="upcoming-retreat-row" onClick={() => onSelectRetreat(r.id)}>
                    <div className="upcoming-retreat-name">{r.name}</div>
                    <div className="upcoming-retreat-meta">
                      {fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {attendees.filter((a) => a.retreat_id === r.id).length} guests confirmed
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ============================================================
   APP SHELL
   ============================================================ */
export default function App() {
  const [session, setSession] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [authError, setAuthError] = useState('')
  const [tab, setTab] = useState('overview')
  const [activeRetreatId, setActiveRetreatId] = useState(null)

  const [retreats, setRetreats] = useState([])
  const [attendees, setAttendees] = useState([])
  const [expenses, setExpenses] = useState([])
  const [todos, setTodos] = useState([])
  const [notes, setNotes] = useState([])
  const [leads, setLeads] = useState([])
  const [subscribers, setSubscribers] = useState([])
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState({ retreats: true, attendees: true, expenses: true, todos: true, notes: true, leads: true, subscribers: true, applications: true })
  const [errorMsg, setErrorMsg] = useState('')

  const loadAll = useCallback(async () => {
    setErrorMsg('')
    const [r, a, e, t, n, l, sub, ap] = await Promise.all([
      supabase.from('ssr_retreats').select('*').order('start_date', { ascending: true }),
      supabase.from('ssr_attendees').select('*').order('name', { ascending: true }),
      supabase.from('ssr_expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('ssr_todos').select('*').order('due_date', { ascending: true }),
      supabase.from('ssr_notes').select('*').order('created_at', { ascending: false }),
      supabase.from('ssr_leads').select('*').order('created_at', { ascending: false }),
      supabase.from('ssr_subscribers').select('*').order('created_at', { ascending: false }),
      supabase.from('ssr_applications').select('*').order('created_at', { ascending: false }),
    ])
    const firstError = [r, a, e, t, n, l, sub, ap].find((res) => res.error)
    if (firstError) setErrorMsg(firstError.error.message)
    setRetreats(r.data || [])
    setAttendees(a.data || [])
    setExpenses(e.data || [])
    setTodos(t.data || [])
    setNotes(n.data || [])
    setLeads(l.data || [])
    setSubscribers(sub.data || [])
    setApplications(ap.data || [])
    setLoading({ retreats: false, attendees: false, expenses: false, todos: false, notes: false, leads: false, subscribers: false, applications: false })
  }, [])

  const checkAllowed = useCallback(async (rawSession) => {
    if (!rawSession) {
      setSession(null)
      return
    }
    const { data: allowed, error: allowErr } = await supabase
      .from('ssr_authorized_users')
      .select('email')
      .eq('email', rawSession.user.email)
      .maybeSingle()
    if (allowErr || !allowed) {
      await supabase.auth.signOut()
      setAuthError("This account isn't authorized for Salty Skins CRM.")
      setSession(null)
      return
    }
    setAuthError('')
    setSession(rawSession)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      await checkAllowed(data.session)
      setSessionChecked(true)
    })
    // Only react to actual sign-in events here — the initial session is
    // handled above, and this listener also fires (with a null session)
    // right after the signOut() inside checkAllowed, which is a no-op.
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_IN') checkAllowed(newSession)
      if (event === 'SIGNED_OUT') setSession(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [checkAllowed])

  async function handleLogin(email, password) {
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    // On success, the SIGNED_IN listener above runs checkAllowed and
    // decides whether `session` actually becomes truthy.
  }

  useEffect(() => {
    if (session) loadAll()
  }, [session, loadAll])

  // --- CRUD helpers ---
  async function createRow(table, data, setter) {
    const { data: row, error } = await supabase.from(table).insert(data).select().single()
    if (error) { setErrorMsg(error.message); return }
    setter((prev) => [...prev, row])
  }
  async function updateRow(table, id, data, setter) {
    const { data: row, error } = await supabase.from(table).update(data).eq('id', id).select().single()
    if (error) { setErrorMsg(error.message); return }
    setter((prev) => prev.map((x) => (x.id === id ? row : x)))
  }
  async function deleteRow(table, id, setter) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { setErrorMsg(error.message); return }
    setter((prev) => prev.filter((x) => x.id !== id))
  }
  async function bulkImportSubscribers(emails) {
    if (emails.length === 0) return { added: 0, skipped: 0 }
    const { data, error } = await supabase
      .from('ssr_subscribers')
      .upsert(emails.map((email) => ({ email })), { onConflict: 'email', ignoreDuplicates: true })
      .select()
    if (error) { setErrorMsg(error.message); return { added: 0, skipped: emails.length } }
    await loadAll()
    const added = data ? data.length : 0
    return { added, skipped: emails.length - added }
  }

  const filteredAttendees = useMemo(
    () => (activeRetreatId ? attendees.filter((a) => a.retreat_id === activeRetreatId) : attendees),
    [attendees, activeRetreatId]
  )
  const filteredExpenses = useMemo(
    () => (activeRetreatId ? expenses.filter((e) => e.retreat_id === activeRetreatId) : expenses),
    [expenses, activeRetreatId]
  )
  const filteredTodos = useMemo(
    () => (activeRetreatId ? todos.filter((t) => t.retreat_id === activeRetreatId) : todos),
    [todos, activeRetreatId]
  )
  const filteredNotes = useMemo(
    () => (activeRetreatId ? notes.filter((n) => n.retreat_id === activeRetreatId) : notes),
    [notes, activeRetreatId]
  )

  if (!sessionChecked) return null
  if (!session) return <Gate authError={authError} onSubmit={handleLogin} />

  function logout() {
    supabase.auth.signOut()
  }

  const activeRetreat = retreats.find((r) => r.id === activeRetreatId)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Salty Skins</h1>
          <div className="tag">Retreat Operations</div>
        </div>

        <nav className="sidebar-nav">
          {Object.entries(TAB_META).map(([key, meta]) => {
            const Icon = meta.icon
            if (meta.external) {
              return (
                <a
                  key={key}
                  className="nav-item"
                  href={meta.external}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Opens the blog editor in a new tab"
                >
                  <Icon />
                  {meta.label}
                </a>
              )
            }
            return (
              <button key={key} className={`nav-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
                <Icon />
                {meta.label}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <div className="sidebar-filter-label">Viewing</div>
          {activeRetreat ? (
            <>
              <div className="sidebar-retreat-name">{activeRetreat.name}</div>
              <div className="sidebar-retreat-dates">{fmtDate(activeRetreat.start_date)} – {fmtDate(activeRetreat.end_date)}</div>
              {daysAway(activeRetreat.start_date) && <span className="sidebar-days-pill">{daysAway(activeRetreat.start_date)}</span>}
            </>
          ) : (
            <div className="sidebar-retreat-name">All retreats</div>
          )}
          <select className="sidebar-retreat-select" value={activeRetreatId || ''} onChange={(e) => setActiveRetreatId(e.target.value || null)}>
            <option value="">All retreats</option>
            {retreats.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="sidebar-logout" onClick={logout}>Log out</button>
        </div>
      </aside>

      <div className="content-area">
        <main className="main">
          {errorMsg && (
            <div className="empty-state" style={{ color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 10, marginBottom: 16 }}>
              {errorMsg}
            </div>
          )}
          {activeRetreat && (
            <div className="section-sub" style={{ marginBottom: 12 }}>
              Filtered to <strong>{activeRetreat.name}</strong> — <button className="btn sm ghost" onClick={() => setActiveRetreatId(null)}>clear filter</button>
            </div>
          )}

        {tab === 'overview' && (
          <OverviewView
            retreats={retreats}
            attendees={attendees}
            expenses={expenses}
            todos={todos}
            userEmail={session.user.email}
            activeRetreatId={activeRetreatId}
            onToggleTodo={(id, done) => updateRow('ssr_todos', id, { done }, setTodos)}
            onGoToTab={setTab}
            onSelectRetreat={setActiveRetreatId}
          />
        )}

        {tab === 'leads' && (
          <LeadsView
            leads={leads}
            loading={loading.leads}
            onDelete={(id) => deleteRow('ssr_leads', id, setLeads)}
          />
        )}

        {tab === 'subscribers' && (
          <SubscribersView
            subscribers={subscribers}
            loading={loading.subscribers}
            onDelete={(id) => deleteRow('ssr_subscribers', id, setSubscribers)}
            onBulkImport={bulkImportSubscribers}
          />
        )}

        {tab === 'applications' && (
          <ApplicationsView
            applications={applications}
            loading={loading.applications}
            onUpdateStatus={(id, status) => updateRow('ssr_applications', id, { status }, setApplications)}
            onDelete={(id) => deleteRow('ssr_applications', id, setApplications)}
          />
        )}

        {tab === 'retreats' && (
          <RetreatsView
            retreats={retreats}
            loading={loading.retreats}
            activeRetreatId={activeRetreatId}
            onSelectRetreat={setActiveRetreatId}
            onCreate={(data) => createRow('ssr_retreats', data, setRetreats)}
            onUpdate={(id, data) => updateRow('ssr_retreats', id, data, setRetreats)}
            onDelete={async (id) => { await deleteRow('ssr_retreats', id, setRetreats); if (activeRetreatId === id) setActiveRetreatId(null); loadAll() }}
          />
        )}

        {tab === 'attendees' && (
          <AttendeesView
            attendees={filteredAttendees}
            retreats={retreats}
            loading={loading.attendees}
            activeRetreatId={activeRetreatId}
            onCreate={(data) => createRow('ssr_attendees', data, setAttendees)}
            onUpdate={(id, data) => updateRow('ssr_attendees', id, data, setAttendees)}
            onDelete={(id) => deleteRow('ssr_attendees', id, setAttendees)}
          />
        )}

        {tab === 'flights' && (
          <FlightsView
            attendees={filteredAttendees}
            retreats={retreats}
            loading={loading.attendees}
            activeRetreatId={activeRetreatId}
          />
        )}

        {tab === 'expenses' && (
          <ExpensesView
            expenses={filteredExpenses}
            attendees={filteredAttendees}
            retreats={retreats}
            loading={loading.expenses}
            activeRetreatId={activeRetreatId}
            onCreate={(data) => createRow('ssr_expenses', data, setExpenses)}
            onUpdate={(id, data) => updateRow('ssr_expenses', id, data, setExpenses)}
            onDelete={(id) => deleteRow('ssr_expenses', id, setExpenses)}
          />
        )}

        {tab === 'todos' && (
          <TodosView
            todos={filteredTodos}
            retreats={retreats}
            loading={loading.todos}
            activeRetreatId={activeRetreatId}
            onCreate={(data) => createRow('ssr_todos', data, setTodos)}
            onToggle={(id, done) => updateRow('ssr_todos', id, { done }, setTodos)}
            onUpdate={(id, data) => updateRow('ssr_todos', id, data, setTodos)}
            onDelete={(id) => deleteRow('ssr_todos', id, setTodos)}
          />
        )}

        {tab === 'notes' && (
          <NotesView
            notes={filteredNotes}
            retreats={retreats}
            loading={loading.notes}
            activeRetreatId={activeRetreatId}
            onCreate={(data) => createRow('ssr_notes', data, setNotes)}
            onUpdate={(id, data) => updateRow('ssr_notes', id, data, setNotes)}
            onDelete={(id) => deleteRow('ssr_notes', id, setNotes)}
          />
        )}
      </main>
      </div>
    </div>
  )
}
