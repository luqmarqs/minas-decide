import { describe, expect, it } from 'vitest';
import { GroupProposalInput, isWhatsAppInviteUrl } from './groups.ts';

describe('isWhatsAppInviteUrl', () => {
  it('accepts official invite links only', () => {
    expect(isWhatsAppInviteUrl('https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv')).toBe(true);
    expect(isWhatsAppInviteUrl('http://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv')).toBe(false);
    expect(isWhatsAppInviteUrl('https://wa.me/5531999998888')).toBe(false);
    expect(isWhatsAppInviteUrl('https://bit.ly/abc')).toBe(false);
    expect(isWhatsAppInviteUrl('https://chat.whatsapp.com/AbC?x=1')).toBe(false);
    expect(isWhatsAppInviteUrl('javascript:alert(1)')).toBe(false);
    expect(isWhatsAppInviteUrl('not a url')).toBe(false);
  });
});

describe('GroupProposalInput', () => {
  it('rejects proposals with non-whatsapp urls and missing responsibility', () => {
    const r = GroupProposalInput.safeParse({
      territory_id: 'mg-3140001-centro',
      name_proposed: 'Grupo Centro',
      join_url_proposed: 'https://example.com/x',
      proposer_name: 'Ana',
      proposer_email: 'ana@example.org',
      proposer_phone: '31999998888',
      responsibility_accepted: false,
      consent_version: 'v1',
      turnstile_token: 'tok',
    });
    expect(r.success).toBe(false);
  });
});
