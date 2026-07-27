import React, { useEffect, useRef, useState } from 'react'

/* ============================================================
   Onboarding — multi-step "get started" flow.

   Converted from onboarding.html to match App.jsx's conventions:
     - Uses the app's existing CSS custom properties (--red, --text,
       --border, --font, --radius, etc. from index.css) instead of
       shipping a separate font/color theme.
     - Single-file component with a scoped <style> block, same pattern
       you'd drop next to Email.jsx / Notes.jsx / etc.
     - No external font loading (system font stack only, like the rest
       of the app).

   USAGE (e.g. in your main.jsx / entry point):

     import Onboarding, { hasOnboarded } from './Onboarding.jsx'
     import App from './App.jsx'

     function Root() {
       const [onboarded, setOnboarded] = useState(hasOnboarded)
       if (!onboarded) {
         return (
           <Onboarding
             onComplete={() => setOnboarded(true)}
             onLogin={() => { /* route to your login screen */ }}
           />
         )
       }
       return <App />
     }

   `hasOnboarded()` reads the localStorage flag synchronously, so you
   can check it before the first render and skip straight to <App />
   with no flash of the onboarding screen.
   ============================================================ */

const ONBOARDING_KEY = 'todoist-onboarding-complete'

export function hasOnboarded() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true'
  } catch {
    return false
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true')
  } catch {}
}

const GROUPS = [
  { label: 'Intro', steps: [0] },
  { label: 'Features', steps: [1, 2, 3] },
  { label: 'Name', steps: [4] },
  { label: 'Account', steps: [5] },
  { label: 'Verify', steps: [6] },
  { label: 'Done', steps: [7] },
]

function groupOf(stepIndex) {
  return GROUPS.findIndex(g => g.steps.includes(stepIndex))
}

const CheckSvg = ({ style }) => (
  <svg viewBox="0 0 24 24" style={style}><path d="M4 12l5 5L20 6" /></svg>
)

/** Progress pill row at the top: one dot per group, filling in + bursting as you pass it. */
function ProgressBar({ current }) {
  const activeGroup = groupOf(current)
  const [burstGroup, setBurstGroup] = useState(null)
  const prevGroup = useRef(activeGroup)

  useEffect(() => {
    if (activeGroup > prevGroup.current) {
      setBurstGroup(prevGroup.current)
      const t = setTimeout(() => setBurstGroup(null), 550)
      prevGroup.current = activeGroup
      return () => clearTimeout(t)
    }
    prevGroup.current = activeGroup
  }, [activeGroup])

  return (
    <div className="onb-topbar">
      <div className="onb-progress-list">
        {GROUPS.map((g, i) => {
          const done = i < activeGroup
          const active = i === activeGroup
          const bursting = i === burstGroup
          return (
            <div key={g.label} className={`onb-progress-item${active ? ' active' : ''}${done ? ' done' : ''}`}>
              <div className="onb-p-check">
                <CheckSvg style={{ strokeDashoffset: done ? 0 : 16 }} />
                {bursting && (
                  <div className="onb-burst">
                    {Array.from({ length: 6 }).map((_, k) => {
                      const angle = (k / 6) * 2 * Math.PI
                      const dx = Math.cos(angle) * 22
                      const dy = Math.sin(angle) * 22
                      return <span key={k} className="onb-burst-dot" style={{ '--dx': `${dx}px`, '--dy': `${dy}px` }} />
                    })}
                  </div>
                )}
              </div>
              <span className="onb-p-label">{g.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Onboarding({ onComplete, onLogin, appName = 'Tasks' }) {
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState('forward')
  const [leaving, setLeaving] = useState(false)

  const [fname, setFname] = useState('')
  const [fnameErr, setFnameErr] = useState('')

  const [avatarPreview, setAvatarPreview] = useState(null)
  const avatarInputRef = useRef(null)

  const [username, setUsername] = useState('')
  const [usernameHint, setUsernameHint] = useState('3–20 characters, letters, numbers, and underscores.')
  const [usernameErr, setUsernameErr] = useState(false)

  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwHint, setPwHint] = useState('Use 8+ characters with a number or symbol.')
  const [pwErr, setPwErr] = useState(false)

  const [botState, setBotState] = useState('idle') // idle | loading | verified

  function goTo(index) {
    if (index === current) return
    const forward = index > current
    setDirection(forward ? 'forward' : 'back')
    setLeaving(true)
    setTimeout(() => {
      setLeaving(false)
      setCurrent(index)
    }, forward ? 260 : 0)
  }

  const next = () => setCurrent(c => { goTo(c + 1); return c })
  const prev = () => setCurrent(c => { goTo(c - 1); return c })

  function validateName() {
    const val = fname.trim()
    if (val.length < 2) {
      setFnameErr('Enter your name to continue.')
      return
    }
    setFnameErr('')
    goTo(5)
  }

  function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setAvatarPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  function strengthScore(val) {
    let score = 0
    if (val.length >= 8) score++
    if (/[0-9]/.test(val)) score++
    if (/[^A-Za-z0-9]/.test(val)) score++
    if (val.length >= 12) score++
    return score
  }

  function validateAccount() {
    let ok = true
    const uname = username.trim()
    if (uname.length < 3 || !/^[a-zA-Z0-9_]+$/.test(uname)) {
      setUsernameHint('Pick a username of 3+ characters (letters, numbers, underscores).')
      setUsernameErr(true)
      ok = false
    } else {
      setUsernameHint('Looks good.')
      setUsernameErr(false)
    }

    if (password.length < 8) {
      setPwHint('Password needs to be at least 8 characters.')
      setPwErr(true)
      ok = false
    } else {
      setPwHint('Looks good.')
      setPwErr(false)
    }

    if (ok) goTo(6)
  }

  function runBotCheck() {
    if (botState !== 'idle') return
    setBotState('loading')
    setTimeout(() => setBotState('verified'), 900)
  }

  function finish() {
    markOnboarded()
    onComplete?.({
      name: fname.trim(),
      username: username.trim(),
      avatarDataUrl: avatarPreview,
      // Password is intentionally not persisted here — hash it server-side
      // (or wire it into your real auth flow) before storing anywhere.
    })
  }

  const firstNameOnly = fname.trim().split(' ')[0]
  const score = strengthScore(password)
  const strengthColors = ['var(--onb-border)', 'var(--onb-red)', '#e8a93b', 'var(--onb-green)', 'var(--onb-green)']

  return (
    <div className="onb-root">
      <style>{ONBOARDING_CSS}</style>

      <ProgressBar current={current} />

      <div className="onb-stage">
        <div className="onb-card">

          {current === 0 && (
            <section className={`onb-step active${leaving ? ' leaving' : ''}`}>
              <div className="onb-logo">
                <div className="onb-logo-mark"><CheckSvg /></div>
                <span className="onb-logo-word">{appName}</span>
              </div>
              <div className="onb-eyebrow">Welcome</div>
              <h1>The to-do list that keeps up with <span className="onb-accent">your</span> life.</h1>
              <p className="onb-lede">Takes about a minute to set up. We'll show you around, then get your account ready.</p>
              <div className="onb-actions">
                <button className="onb-btn onb-btn-primary" onClick={next}>Get started</button>
              </div>
            </section>
          )}

          {current === 1 && (
            <section className={`onb-step active${leaving ? ' leaving' : ''}`}>
              <div className="onb-eyebrow">What you can do</div>
              <h1>Capture everything, before it slips away.</h1>
              <div className="onb-feature-visual">
                <div className="onb-mock-stack">
                  <div className="onb-mock-row"><span className="onb-mock-dot" /> Call the dentist — tmrw 9am</div>
                  <div className="onb-mock-row"><span className="onb-mock-dot" /> Renew passport</div>
                  <div className="onb-mock-row"><span className="onb-mock-dot" /> Ping Sam about the deck</div>
                </div>
              </div>
              <p className="onb-lede">Type it the way you'd say it out loud — "tmrw 9am" becomes a real reminder. No forms, no friction, just get it out of your head.</p>
              <div className="onb-actions">
                <button className="onb-btn onb-btn-ghost" onClick={prev}>Back</button>
                <button className="onb-btn onb-btn-primary" onClick={next}>Next</button>
              </div>
            </section>
          )}

          {current === 2 && (
            <section className={`onb-step active${leaving ? ' leaving' : ''}`}>
              <div className="onb-eyebrow">What you can do</div>
              <h1>A plan that moves when your day does.</h1>
              <div className="onb-feature-visual">
                <div className="onb-mock-stack">
                  <div className="onb-mock-row"><span className="onb-mock-dot on" /> <span className="onb-mock-strike">Draft proposal</span></div>
                  <div className="onb-mock-row"><span className="onb-mock-dot" /> Gym — repeats every Mon/Wed/Fri</div>
                  <div className="onb-mock-row"><span className="onb-mock-dot" /> Review budget → moved to Fri</div>
                </div>
              </div>
              <p className="onb-lede">Drag a task to tomorrow in one motion. Recurring plans reschedule themselves, so a busy week never means a broken streak.</p>
              <div className="onb-actions">
                <button className="onb-btn onb-btn-ghost" onClick={prev}>Back</button>
                <button className="onb-btn onb-btn-primary" onClick={next}>Next</button>
              </div>
            </section>
          )}

          {current === 3 && (
            <section className={`onb-step active${leaving ? ' leaving' : ''}`}>
              <div className="onb-eyebrow">Why it matters</div>
              <h1>Some things change once this becomes a habit.</h1>
              <ul className="onb-benefit-list">
                <li><span className="onb-bi">✓</span> Your head gets quieter — everything has a place, so nothing has to be held onto.</li>
                <li><span className="onb-bi">✓</span> Mornings start with a plan instead of a scramble.</li>
                <li><span className="onb-bi">✓</span> A finished day actually feels finished, because you can see it.</li>
              </ul>
              <p className="onb-lede">That's the whole idea. Now let's get your account set up.</p>
              <div className="onb-actions">
                <button className="onb-btn onb-btn-ghost" onClick={prev}>Back</button>
                <button className="onb-btn onb-btn-primary" onClick={next}>Continue</button>
              </div>
            </section>
          )}

          {current === 4 && (
            <section className={`onb-step active${leaving ? ' leaving' : ''}`}>
              <div className="onb-eyebrow">Let's start with you</div>
              <h1>What should we call you?</h1>
              <p className="onb-lede">This is how you'll show up to anyone you share a list with.</p>
              <div className="onb-field">
                <label htmlFor="onb-fname">Your name</label>
                <input
                  id="onb-fname"
                  type="text"
                  placeholder="e.g. Jordan Reyes"
                  autoComplete="name"
                  value={fname}
                  onChange={e => setFname(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') validateName() }}
                />
                <div className={`onb-hint${fnameErr ? ' err' : ''}`}>{fnameErr}</div>
              </div>
              <div className="onb-actions">
                <button className="onb-btn onb-btn-ghost" onClick={prev}>Back</button>
                <button className="onb-btn onb-btn-primary" onClick={validateName}>Continue</button>
              </div>
            </section>
          )}

          {current === 5 && (
            <section className={`onb-step active${leaving ? ' leaving' : ''}`}>
              <div className="onb-eyebrow">Create your account</div>
              <h1>{firstNameOnly ? `Nice to meet you, ${firstNameOnly}.` : 'Set up your profile.'}</h1>
              <p className="onb-lede">Pick a username and a password. A photo is optional, but it helps people recognize you.</p>

              <div className="onb-avatar-row">
                <div className="onb-avatar-drop" onClick={() => avatarInputRef.current?.click()}>
                  {avatarPreview
                    ? <img src={avatarPreview} alt="" />
                    : <svg viewBox="0 0 24 24"><path d="M12 15V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>}
                </div>
                <div className="onb-avatar-copy">
                  <b>Profile photo</b>
                  <span className="onb-link" onClick={() => avatarInputRef.current?.click()}>Upload an image</span> — JPG or PNG
                </div>
                <input ref={avatarInputRef} type="file" accept="image/png, image/jpeg" onChange={handleAvatarChange} style={{ display: 'none' }} />
              </div>

              <div className="onb-field">
                <label htmlFor="onb-username">Username</label>
                <input
                  id="onb-username"
                  type="text"
                  placeholder="e.g. jreyes"
                  autoComplete="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
                <div className={`onb-hint${usernameErr ? ' err' : ''}`}>{usernameHint}</div>
              </div>

              <div className="onb-field">
                <label htmlFor="onb-password">Password</label>
                <div className="onb-pw-wrap">
                  <input
                    id="onb-password"
                    type={showPw ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button type="button" className="onb-pw-toggle" onClick={() => setShowPw(v => !v)}>
                    {showPw ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                <div className="onb-strength">
                  {[0, 1, 2, 3].map(i => (
                    <i key={i} style={{ background: i < score ? strengthColors[score] : 'var(--onb-border)' }} />
                  ))}
                </div>
                <div className={`onb-hint${pwErr ? ' err' : ''}`}>{pwHint}</div>
              </div>

              <div className="onb-actions">
                <button className="onb-btn onb-btn-ghost" onClick={prev}>Back</button>
                <button className="onb-btn onb-btn-primary" onClick={validateAccount}>Continue</button>
              </div>
            </section>
          )}

          {current === 6 && (
            <section className={`onb-step active${leaving ? ' leaving' : ''}`}>
              <div className="onb-eyebrow">One last thing</div>
              <h1>Quick check before we continue.</h1>
              <p className="onb-lede">Just confirming you're a person, not a script. Takes a second.</p>

              <div className={`onb-bot-box${botState === 'verified' ? ' verified' : ''}`}>
                <div className={`onb-bot-check${botState === 'loading' ? ' loading' : ''}`} onClick={runBotCheck}>
                  {botState === 'loading' && <div className="onb-bot-spinner" />}
                  <CheckSvg style={{ strokeDashoffset: botState === 'verified' ? 0 : 16 }} />
                </div>
                <div className="onb-bot-text">
                  <b>
                    {botState === 'verified' ? "You're verified" : botState === 'loading' ? 'Checking…' : "I'm not a robot"}
                  </b>
                </div>
                <div className="onb-bot-badge">SECURE</div>
              </div>

              <div className="onb-actions">
                <button className="onb-btn onb-btn-ghost" onClick={prev}>Back</button>
                <button className="onb-btn onb-btn-primary" disabled={botState !== 'verified'} onClick={next}>Continue</button>
              </div>
            </section>
          )}

          {current === 7 && (
            <section className={`onb-step active${leaving ? ' leaving' : ''}`}>
              <div className="onb-center">
                <div className="onb-done-mark"><CheckSvg /></div>
                <div className="onb-eyebrow" style={{ justifyContent: 'center' }}><span /></div>
                <h1>{firstNameOnly ? `You're all set, ${firstNameOnly}.` : "You're all set."}</h1>
                <p className="onb-lede">Your list is empty and waiting. First task takes ten seconds — try it now.</p>
                <div className="onb-actions">
                  <button className="onb-btn onb-btn-primary" onClick={finish}>Go to my list</button>
                </div>
              </div>
            </section>
          )}

        </div>

        <div className="onb-footer">
          Already a user? <span className="onb-link" onClick={() => onLogin?.()}>Log in here</span>
        </div>
      </div>
    </div>
  )
}

const ONBOARDING_CSS = `
.onb-root{
  --onb-red: var(--red, #db4c3f);
  --onb-red-dark: var(--red-dark, #c2372b);
  --onb-red-tint: var(--red-light, #fdeeed);
  --onb-green: #299438;
  --onb-green-tint: #e7f5ea;
  --onb-ink: var(--text, #202020);
  --onb-ink-soft: var(--text-secondary, #808080);
  --onb-ink-faint: var(--text-faint, #a0a0a0);
  --onb-paper: var(--bg-sidebar, #fafafa);
  --onb-card: var(--bg, #ffffff);
  --onb-border: var(--border, #e7e7e7);
  --onb-border-soft: var(--border-light, #f0f0f0);
  --onb-radius: var(--radius, 8px);
  --onb-font: var(--font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  --onb-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --onb-ease: cubic-bezier(0.22, 1, 0.36, 1);

  font-family: var(--onb-font);
  background: var(--onb-paper);
  background-image: radial-gradient(circle at 1.5px 1.5px, var(--onb-border-soft) 1.5px, transparent 0);
  background-size: 28px 28px;
  color: var(--onb-ink);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  width: 100%;
}
.onb-root *{ box-sizing: border-box; }
@media (prefers-reduced-motion: reduce){
  .onb-root *, .onb-root *::before, .onb-root *::after{ animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

.onb-topbar{ width: 100%; display: flex; justify-content: center; padding: 22px 20px 0; }
.onb-progress-list{
  display: flex; align-items: center; gap: 6px;
  background: var(--onb-card); border: 1px solid var(--onb-border);
  padding: 8px 14px; border-radius: 999px;
  box-shadow: 0 1px 2px rgba(32,32,32,0.04);
}
.onb-progress-item{ display: flex; align-items: center; gap: 7px; padding: 4px 8px; border-radius: 999px; transition: background .25s var(--onb-ease); position: relative; }
.onb-progress-item.active{ background: var(--onb-red-tint); }
.onb-p-check{ position: relative; width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--onb-border); flex-shrink: 0; transition: border-color .3s var(--onb-ease), background .3s var(--onb-ease); }
.onb-progress-item.active .onb-p-check{ border-color: var(--onb-red); }
.onb-progress-item.done .onb-p-check{ border-color: var(--onb-green); background: var(--onb-green); }
.onb-p-check svg{ position: absolute; inset: 0; margin: auto; width: 11px; height: 11px; stroke: white; stroke-width: 3; fill: none; stroke-dasharray: 16; transition: stroke-dashoffset .35s var(--onb-ease) .05s; }
.onb-p-label{ font-family: var(--onb-mono); font-size: 10.5px; letter-spacing: 0.03em; color: var(--onb-ink-faint); text-transform: uppercase; white-space: nowrap; display: none; }
.onb-progress-item.active .onb-p-label{ display: inline; color: var(--onb-red-dark); }
@media (max-width: 560px){ .onb-p-label{ display: none !important; } }

.onb-burst{ position: absolute; inset: 0; pointer-events: none; }
.onb-burst-dot{ position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; border-radius: 50%; background: var(--onb-green); animation: onb-fly .5s var(--onb-ease) forwards; }
@keyframes onb-fly{
  0%{ opacity: 1; transform: translate(-50%,-50%) scale(1); }
  100%{ opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.4); }
}

.onb-stage{ flex: 1; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 20px 20px; }
.onb-card{
  width: 100%; max-width: 480px; background: var(--onb-card);
  border: 1px solid var(--onb-border); border-radius: var(--onb-radius);
  box-shadow: 0 1px 3px rgba(32,32,32,0.04), 0 12px 32px rgba(32,32,32,0.05);
  padding: 44px 40px 36px; position: relative; overflow: hidden;
}
@media (max-width: 560px){ .onb-card{ padding: 34px 22px 28px; } }

.onb-step.active{ display: block; animation: onb-enter .45s var(--onb-ease); }
@keyframes onb-enter{ from{ opacity: 0; transform: translateX(18px); } to{ opacity: 1; transform: translateX(0); } }
.onb-step.leaving{ animation: onb-leave .26s var(--onb-ease) forwards; }
@keyframes onb-leave{ to{ opacity: 0; transform: translateX(-18px); } }

.onb-eyebrow{ font-family: var(--onb-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--onb-red); margin: 0 0 14px; display: flex; align-items: center; gap: 8px; }
.onb-eyebrow::before{ content: ''; width: 16px; height: 2px; background: var(--onb-red); border-radius: 2px; }

.onb-root h1{ font-size: 28px; line-height: 1.2; letter-spacing: -0.01em; margin: 0 0 12px; font-weight: 700; }
.onb-accent{ color: var(--onb-red); }
.onb-lede{ font-size: 15px; line-height: 1.6; color: var(--onb-ink-soft); margin: 0 0 28px; }

.onb-logo{ display: flex; align-items: center; gap: 9px; margin-bottom: 26px; }
.onb-logo-mark{ width: 30px; height: 30px; border-radius: 9px; background: var(--onb-red); display: flex; align-items: center; justify-content: center; }
.onb-logo-mark svg{ width: 16px; height: 16px; stroke: white; stroke-width: 3; fill: none; stroke-dashoffset: 0 !important; }
.onb-logo-word{ font-weight: 700; font-size: 17px; letter-spacing: -0.01em; }

.onb-feature-visual{ height: 150px; border-radius: var(--onb-radius); background: var(--onb-paper); border: 1px solid var(--onb-border-soft); margin-bottom: 24px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.onb-mock-row{ display: flex; align-items: center; gap: 10px; width: 82%; padding: 10px 14px; background: var(--onb-card); border: 1px solid var(--onb-border); border-radius: 9px; margin: 5px 0; font-size: 12.5px; color: var(--onb-ink-soft); }
.onb-mock-dot{ width: 15px; height: 15px; border-radius: 50%; border: 2px solid var(--onb-border); flex-shrink: 0; }
.onb-mock-dot.on{ border-color: var(--onb-green); background: var(--onb-green); }
.onb-mock-stack{ display: flex; flex-direction: column; }
.onb-mock-strike{ text-decoration: line-through; color: var(--onb-ink-faint); }

.onb-benefit-list{ list-style: none; padding: 0; margin: 0 0 28px; display: flex; flex-direction: column; gap: 12px; }
.onb-benefit-list li{ display: flex; gap: 11px; align-items: flex-start; font-size: 14.5px; color: var(--onb-ink); line-height: 1.5; }
.onb-bi{ width: 20px; height: 20px; border-radius: 50%; background: var(--onb-green-tint); color: var(--onb-green); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; font-size: 12px; font-weight: 700; }

.onb-field{ margin-bottom: 18px; }
.onb-field label{ display: block; font-size: 12.5px; font-weight: 600; color: var(--onb-ink-soft); margin-bottom: 7px; }
.onb-field input[type=text], .onb-field input[type=password]{
  width: 100%; padding: 12px 14px; border: 1.5px solid var(--onb-border); border-radius: 9px;
  font-size: 14.5px; font-family: var(--onb-font); color: var(--onb-ink); background: var(--onb-paper);
  transition: border-color .2s var(--onb-ease), background .2s var(--onb-ease);
}
.onb-field input:focus{ outline: none; border-color: var(--onb-red); background: var(--onb-card); }
.onb-hint{ font-size: 12px; color: var(--onb-ink-faint); margin-top: 6px; min-height: 15px; }
.onb-hint.err{ color: var(--onb-red-dark); }

.onb-pw-wrap{ position: relative; }
.onb-pw-toggle{ position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-family: var(--onb-mono); font-size: 10.5px; color: var(--onb-ink-faint); letter-spacing: 0.02em; padding: 4px 6px; }
.onb-pw-toggle:hover{ color: var(--onb-ink-soft); }
.onb-strength{ display: flex; gap: 4px; margin-top: 8px; }
.onb-strength i{ height: 3px; flex: 1; background: var(--onb-border); border-radius: 2px; transition: background .25s var(--onb-ease); }

.onb-avatar-row{ display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
.onb-avatar-drop{ width: 72px; height: 72px; border-radius: 50%; border: 1.5px dashed var(--onb-border); background: var(--onb-paper); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; position: relative; overflow: hidden; transition: border-color .2s var(--onb-ease); }
.onb-avatar-drop:hover{ border-color: var(--onb-red); }
.onb-avatar-drop img{ width: 100%; height: 100%; object-fit: cover; }
.onb-avatar-drop svg{ width: 22px; height: 22px; stroke: var(--onb-ink-faint); fill: none; stroke-width: 1.6; }
.onb-avatar-copy{ font-size: 13px; color: var(--onb-ink-soft); line-height: 1.5; }
.onb-avatar-copy b{ color: var(--onb-ink); font-weight: 600; display: block; font-size: 13.5px; }
.onb-link{ color: var(--onb-red); font-weight: 600; cursor: pointer; }
.onb-link:hover{ text-decoration: underline; }

.onb-bot-box{ border: 1.5px solid var(--onb-border); border-radius: 11px; padding: 16px 18px; display: flex; align-items: center; gap: 14px; background: var(--onb-paper); margin-bottom: 24px; transition: border-color .2s var(--onb-ease); }
.onb-bot-box.verified{ border-color: var(--onb-green); background: var(--onb-green-tint); }
.onb-bot-check{ width: 24px; height: 24px; border-radius: 6px; border: 2px solid var(--onb-border); background: var(--onb-card); flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; }
.onb-bot-check svg{ width: 14px; height: 14px; stroke: white; stroke-width: 3; fill: none; transition: stroke-dashoffset .3s var(--onb-ease); }
.onb-bot-box.verified .onb-bot-check{ border-color: var(--onb-green); background: var(--onb-green); }
.onb-bot-check.loading{ border-color: transparent; }
.onb-bot-check.loading svg{ display: none; }
.onb-bot-spinner{ width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--onb-border); border-top-color: var(--onb-red); animation: onb-spin .7s linear infinite; }
@keyframes onb-spin{ to{ transform: rotate(360deg); } }
.onb-bot-text{ font-size: 13.5px; color: var(--onb-ink-soft); }
.onb-bot-text b{ color: var(--onb-ink); }
.onb-bot-badge{ margin-left: auto; font-family: var(--onb-mono); font-size: 9.5px; color: var(--onb-ink-faint); text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid var(--onb-border); border-radius: 5px; padding: 4px 6px; }

.onb-actions{ display: flex; align-items: center; gap: 14px; margin-top: 8px; }
.onb-btn{ font-family: var(--onb-font); font-weight: 700; font-size: 14.5px; border-radius: 9px; border: none; cursor: pointer; padding: 13px 22px; transition: transform .15s var(--onb-ease), background .2s var(--onb-ease), box-shadow .2s var(--onb-ease); }
.onb-btn:active{ transform: scale(0.97); }
.onb-btn-primary{ background: var(--onb-red); color: white; flex: 1; box-shadow: 0 2px 0 var(--onb-red-dark); }
.onb-btn-primary:hover{ background: var(--onb-red-dark); }
.onb-btn-primary:disabled{ background: var(--onb-border); box-shadow: none; color: var(--onb-ink-faint); cursor: not-allowed; }
.onb-btn-ghost{ background: transparent; color: var(--onb-ink-soft); padding: 13px 10px; }
.onb-btn-ghost:hover{ color: var(--onb-ink); }

.onb-done-mark{ width: 60px; height: 60px; border-radius: 50%; background: var(--onb-green-tint); display: flex; align-items: center; justify-content: center; margin: 0 auto 22px; }
.onb-done-mark svg{ width: 28px; height: 28px; stroke: var(--onb-green); stroke-width: 3; fill: none; stroke-dasharray: 40; animation: onb-draw .5s var(--onb-ease) .2s forwards; }
@keyframes onb-draw{ to{ stroke-dashoffset: 0; } }
.onb-center{ text-align: center; }

.onb-footer{ margin-top: 18px; font-size: 13px; color: var(--onb-ink-soft); text-align: center; }
`
