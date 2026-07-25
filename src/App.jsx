import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from './supabaseClient'

/* ============================================================
   Salty Skins Retreats — Operations CRM
   Single-file app: retreats, attendees + flights, expenses, todos.
   Pattern matches SafeHavenCRM: one App.jsx, Supabase for data.
   ============================================================ */

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
        <div className="empty-state">No retreats yet. Create your first one to start tracking attendees, expenses, and tasks.</div>
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
            This will delete <strong>{confirmDelete.name}</strong> and all of its attendees and to-dos. Expenses linked to it will be kept but unlinked. This can't be undone.
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
    onSave({ ...f, amount_paid: f.amount_paid === '' ? 0 : Number(f.amount_paid) })
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
        <button type="submit" className="btn clay">Save attendee</button>
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
          <h2>Attendees</h2>
          <div className="section-sub">
            {attendees.length} {activeRetreatId ? 'for selected retreat' : 'across all retreats'}
          </div>
        </div>
        <button className="btn clay" disabled={retreats.length === 0} onClick={() => setEditing('new')}>+ Add attendee</button>
      </div>

      {retreats.length === 0 ? (
        <div className="empty-state">Create a retreat first, then add attendees to it.</div>
      ) : loading ? (
        <div className="loading-state">Loading attendees…</div>
      ) : attendees.length === 0 ? (
        <div className="empty-state">No attendees yet for this view.</div>
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
        <Modal title={editing === 'new' ? 'Add attendee' : 'Edit attendee'} onClose={() => setEditing(null)}>
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
        <Modal title="Delete attendee?" onClose={() => setConfirmDelete(null)}>
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
    onSave({ ...f, retreat_id: f.retreat_id || null, amount: Number(f.amount || 0) })
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
            Income from attendee payments · {expenses.length} expense entries {activeRetreatId ? 'for selected retreat' : 'across all retreats'}
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
    onSave({ ...f, retreat_id: f.retreat_id || null })
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
          <h2>To-dos</h2>
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

  const retreatName = (id) => (retreats.find((r) => r.id === id) || {}).name || 'General'
  const sorted = [...notes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

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
        <div className="card-grid">
          {sorted.map((n) => (
            <div key={n.id} className="card">
              <div className="meta-row">
                {!activeRetreatId && <span>{retreatName(n.retreat_id)}</span>}
                <span>{fmtDate(n.created_at)}</span>
              </div>
              <div className="desc" style={{ whiteSpace: 'pre-wrap' }}>{n.content}</div>
              <div className="card-actions">
                <button className="btn sm secondary" onClick={() => setEditing(n)}>Edit</button>
                <button className="btn sm danger" onClick={() => setConfirmDelete(n)}>Delete</button>
              </div>
            </div>
          ))}
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
   APP SHELL
   ============================================================ */
export default function App() {
  const [session, setSession] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [authError, setAuthError] = useState('')
  const [tab, setTab] = useState('retreats')
  const [activeRetreatId, setActiveRetreatId] = useState(null)

  const [retreats, setRetreats] = useState([])
  const [attendees, setAttendees] = useState([])
  const [expenses, setExpenses] = useState([])
  const [todos, setTodos] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState({ retreats: true, attendees: true, expenses: true, todos: true, notes: true })
  const [errorMsg, setErrorMsg] = useState('')

  const loadAll = useCallback(async () => {
    setErrorMsg('')
    const [r, a, e, t, n] = await Promise.all([
      supabase.from('ssr_retreats').select('*').order('start_date', { ascending: true }),
      supabase.from('ssr_attendees').select('*').order('name', { ascending: true }),
      supabase.from('ssr_expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('ssr_todos').select('*').order('due_date', { ascending: true }),
      supabase.from('ssr_notes').select('*').order('created_at', { ascending: false }),
    ])
    const firstError = [r, a, e, t, n].find((res) => res.error)
    if (firstError) setErrorMsg(firstError.error.message)
    setRetreats(r.data || [])
    setAttendees(a.data || [])
    setExpenses(e.data || [])
    setTodos(t.data || [])
    setNotes(n.data || [])
    setLoading({ retreats: false, attendees: false, expenses: false, todos: false, notes: false })
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
      <header className="app-header">
        <div className="brand">
          <h1>Salty Skins</h1>
          <span className="tag">Ops CRM</span>
        </div>
        <div className="retreat-picker">
          <span>Viewing:</span>
          <select value={activeRetreatId || ''} onChange={(e) => setActiveRetreatId(e.target.value || null)}>
            <option value="">All retreats</option>
            {retreats.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn sm ghost" onClick={logout} style={{ borderColor: 'var(--tide-deep)', color: 'var(--sand-deep)' }}>
            Log out
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button className={`tab ${tab === 'retreats' ? 'active' : ''}`} onClick={() => setTab('retreats')}>
          Retreats <span className="count">{retreats.length}</span>
        </button>
        <button className={`tab ${tab === 'attendees' ? 'active' : ''}`} onClick={() => setTab('attendees')}>
          Attendees <span className="count">{filteredAttendees.length}</span>
        </button>
        <button className={`tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}>
          Bookkeeping <span className="count">{filteredExpenses.length}</span>
        </button>
        <button className={`tab ${tab === 'todos' ? 'active' : ''}`} onClick={() => setTab('todos')}>
          To-dos <span className="count">{filteredTodos.filter((t) => !t.done).length}</span>
        </button>
        <button className={`tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
          Notes <span className="count">{filteredNotes.length}</span>
        </button>
      </nav>

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
  )
}
