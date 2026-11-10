import * as Dialog from '@radix-ui/react-dialog';
import { X, FileX2, Download, Upload } from 'lucide-react';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { download } from '../files';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export function Button({
  variant = 'default',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
}) {
  return <button className={cn('btn', variant, className)} {...props} />;
}
export function Card({
  title,
  description,
  children,
  action,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('card', className)}>
      {title && (
        <div className="card-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Empty({
  title = '暂无数据',
  description = '添加评测数据后，可在此查看结果。',
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <FileX2 size={25} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={cn('modal', wide && 'wide')}>
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description ?? '请核对信息后保存。'}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="关闭">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={'badge ' + tone}>{children}</span>;
}
export const number = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? '—' : v.toFixed(d);
export const percent = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : (v * 100).toFixed(1) + '%';
export const date = (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false });
export function Exports({
  name,
  data,
  csvData,
}: {
  name: string;
  data: unknown;
  csvData?: unknown[];
}) {
  return (
    <div className="actions">
      <Button onClick={() => download(name + '.json', data)}>
        <Download size={14} />
        JSON
      </Button>
      {csvData && (
        <Button onClick={() => download(name + '.csv', csvData, 'csv')}>
          <Download size={14} />
          CSV
        </Button>
      )}
    </div>
  );
}
export function FileButton({
  label,
  onFile,
  accept = '.json,.csv',
  busy = false,
}: {
  label: string;
  onFile: (f: File) => void;
  accept?: string;
  busy?: boolean;
}) {
  return (
    <label className={cn('btn file-btn', busy && 'disabled')}>
      <Upload size={15} />
      {label}
      <input
        aria-label={label}
        type="file"
        accept={accept}
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}
