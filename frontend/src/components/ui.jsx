import { Link } from 'react-router-dom'

// Editorial button. Variants: primary (near-black), secondary (outlined), ghost.
export function Button({ as = 'button', to, variant = 'primary', size = 'md', className = '', children, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-control transition-colors disabled:opacity-50 disabled:pointer-events-none'
  const sizes = {
    sm: 'text-control px-3 py-1.5',
    md: 'text-field px-4 py-2',
    lg: 'text-field px-5 py-2.5',
  }
  const variants = {
    primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-cta',
    secondary: 'bg-card text-ink border border-line-input hover:bg-[var(--hover)] shadow-raised',
    ghost: 'text-muted hover:text-ink hover:bg-[var(--hover)]',
    danger: 'text-danger hover:bg-[var(--danger-surface)]',
  }
  const cls = `${base} ${sizes[size]} ${variants[variant]} ${className}`
  if (to) return <Link to={to} className={cls} {...props}>{children}</Link>
  const Tag = as
  return <Tag className={cls} {...props}>{children}</Tag>
}

// A panel: the card surface each block sits in.
export function Panel({ className = '', children, ...props }) {
  return (
    <div className={`bg-card border border-line rounded-panel ${className}`} {...props}>
      {children}
    </div>
  )
}

// Page header with a serif editorial title and a lead paragraph.
export function PageHeader({ title, lead, children }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
      <div>
        <h1 className="title-xl text-[34px] sm:text-[40px]">{title}</h1>
        {lead && <p className="text-muted text-lead mt-1.5 max-w-2xl">{lead}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}

export function SectionTitle({ children, className = '' }) {
  return <h2 className={`title-md text-[22px] ${className}`}>{children}</h2>
}

// Field label + input primitives.
export function Label({ children }) {
  return <label className="block text-[12.5px] text-muted mb-1.5">{children}</label>
}

export function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-control bg-input text-ink text-field border border-line-input px-3 py-2 placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-0 ${className}`}
      {...props}
    />
  )
}

export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={`w-full rounded-control bg-input text-ink text-field border border-line-input px-3 py-2 placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${className}`}
      {...props}
    />
  )
}

export function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

// A quiet status pill.
export function Pill({ tone = 'muted', children }) {
  const tones = {
    muted: 'bg-[var(--selected)] text-muted',
    warning: 'bg-warning-surface text-warning',
    success: 'bg-success-surface text-success',
    danger: 'bg-danger-surface text-danger',
  }
  return <span className={`inline-flex items-center gap-1 text-control px-2 py-0.5 rounded-full ${tones[tone]}`}>{children}</span>
}
