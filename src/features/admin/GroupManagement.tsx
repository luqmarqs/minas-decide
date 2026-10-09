import { useState, type FormEvent } from 'react';
import { AdminGroupPatch, GroupManagerInput } from '@shared/contracts/admin.ts';
import { isWhatsAppInviteUrl } from '@shared/contracts/groups.ts';
import { normalizeBrazilPhone } from '@shared/schemas/phone.ts';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { serverFieldErrors, type FieldErrors } from '@/features/registration/formErrors';
import { addGroupManager, patchGroup } from './api';
import { adminErrorMessage } from './errors';

type Result = { tone: 'ok' | 'error'; text: string } | null;

function ResultLine({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <p
      role={result.tone === 'error' ? 'alert' : 'status'}
      className={result.tone === 'error' ? 'text-sm text-error' : 'text-sm text-success'}
    >
      {result.text}
    </p>
  );
}

/** Group edit + private managers (spec §3.7). Only reachable inside /admin. */
export function GroupManagement({
  groupId,
  initialName,
  initialUrl,
}: {
  groupId: string;
  initialName: string;
  initialUrl: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <EditGroupForm groupId={groupId} initialName={initialName} initialUrl={initialUrl} />
      <ManagerForm groupId={groupId} />
    </div>
  );
}

function EditGroupForm({
  groupId,
  initialName,
  initialUrl,
}: {
  groupId: string;
  initialName: string;
  initialUrl: string;
}) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<'unchanged' | 'active' | 'inactive'>('unchanged');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      ...(name.trim() !== initialName ? { display_name: name } : {}),
      ...(url.trim() !== initialUrl ? { join_url: url.trim() } : {}),
      ...(status !== 'unchanged' ? { status } : {}),
      reason,
    };
    const errs: FieldErrors = {};
    const parsed = AdminGroupPatch.safeParse(body);
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const k = String(i.path[0]);
        errs[k] ??= k === 'reason' ? 'Motivo obrigatório (3 a 500 caracteres).' : 'Valor inválido.';
      }
    }
    if (body.join_url !== undefined && !isWhatsAppInviteUrl(body.join_url))
      errs.join_url = 'Use um link oficial https://chat.whatsapp.com/…';
    if (Object.keys(body).length === 1) errs.display_name ??= 'Nada para alterar.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setResult(null);
    try {
      await patchGroup(groupId, body);
      setResult({ tone: 'ok', text: 'Grupo atualizado e registrado na auditoria.' });
      setReason('');
    } catch (err) {
      setErrors(serverFieldErrors(err));
      setResult({ tone: 'error', text: adminErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <h3 className="font-body text-base font-semibold tracking-normal">Editar grupo publicado</h3>
      <Field label="Nome público" id="ag-name" error={errors.display_name}>
        {(p) => (
          <Input {...p} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label="Link de convite" id="ag-url" error={errors.join_url}>
        {(p) => (
          <Input
            {...p}
            type="url"
            value={url}
            maxLength={200}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}
      </Field>
      <Field label="Estado" id="ag-status">
        {(p) => (
          <Select
            id={p.id}
            value={status}
            onValueChange={(v) => setStatus(v as typeof status)}
            options={[
              { value: 'unchanged', label: 'Não alterar' },
              { value: 'active', label: 'Ativo (visível)' },
              { value: 'inactive', label: 'Inativo (oculto)' },
            ]}
          />
        )}
      </Field>
      <Field label="Motivo da alteração" required id="ag-reason" error={errors.reason}>
        {(p) => (
          <Textarea
            {...p}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      <ResultLine result={result} />
      <div>
        <Button type="submit" variant="secondary" loading={busy}>
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}

function ManagerForm({ groupId }: { groupId: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('responsável');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input = {
      name,
      email: email.trim() || null,
      phone: phone.trim() || null,
      role_label: role.trim() || 'responsável',
    };
    const errs: FieldErrors = {};
    const parsed = GroupManagerInput.safeParse(input);
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const k = String(i.path[0]);
        errs[k] ??=
          k === 'name'
            ? 'Informe o nome (2 a 120 caracteres).'
            : k === 'email'
              ? 'E-mail inválido.'
              : 'Valor inválido.';
      }
    }
    if (input.phone && !normalizeBrazilPhone(input.phone))
      errs.phone = 'Telefone inválido (com DDD).';
    if (!input.email && !input.phone) errs.email ??= 'Informe e-mail ou telefone.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setResult(null);
    try {
      await addGroupManager(groupId, input);
      setResult({
        tone: 'ok',
        text: 'Responsável registrado (dado privado, só visível na administração).',
      });
      setName('');
      setEmail('');
      setPhone('');
    } catch (err) {
      setErrors(serverFieldErrors(err));
      setResult({ tone: 'error', text: adminErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <h3 className="font-body text-base font-semibold tracking-normal">
        Adicionar responsável (privado)
      </h3>
      <p className="text-sm text-muted">
        Nunca aparece publicamente. Use só com consentimento da pessoa.
      </p>
      <Field label="Nome" required id="mg-name" error={errors.name}>
        {(p) => (
          <Input {...p} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="E-mail" id="mg-email" error={errors.email}>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Telefone" id="mg-phone" error={errors.phone}>
          {(p) => (
            <Input
              {...p}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Papel" id="mg-role" error={errors.role_label}>
        {(p) => (
          <Input {...p} value={role} maxLength={60} onChange={(e) => setRole(e.target.value)} />
        )}
      </Field>
      <ResultLine result={result} />
      <div>
        <Button type="submit" variant="secondary" loading={busy}>
          Adicionar responsável
        </Button>
      </div>
    </form>
  );
}
