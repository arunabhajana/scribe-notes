import { describe, expect, it } from 'vitest'
import { authFieldErrors, emailError } from '../src/features/auth/signupValidation'
import { clientConfigError } from '../src/features/auth/clientConfig'

describe('account validation', () => {
  it.each(['', 'plain', 'a@', 'a@b', 'a b@example.com', 'a@@example.com'])('rejects malformed email %j', email => {
    expect(emailError(email)).not.toBe('')
  })
  it('accepts a trimmed valid email', () => expect(emailError(' user+notes@example.com ')).toBe(''))
  it('requires all signup fields', () => {
    expect(Object.values(authFieldErrors('', '', '', '', true)).every(Boolean)).toBe(true)
  })
  it('accepts valid signup fields', () => {
    expect(Object.values(authFieldErrors('Scribe user', 'user@example.com', 'a long password', 'a long password', true))).toEqual(['', '', '', ''])
  })
  it('rejects blank or excessively long display names', () => {
    for (const name of ['   ', 'a'.repeat(61)]) expect(authFieldErrors(name, 'a@b.com', 'a long password', 'a long password', true).displayName).not.toBe('')
  })
  it('enforces signup password length and confirmation', () => {
    expect(authFieldErrors('A', 'a@b.com', 'short', 'different', true)).toMatchObject({ password: 'Use at least 12 characters.', confirmPassword: 'Passwords do not match.' })
    expect(authFieldErrors('A', 'a@b.com', 'a'.repeat(1025), '', true).password).not.toBe('')
  })
  it('does not impose signup-only fields or minimum length on existing sign-ins', () => {
    expect(Object.values(authFieldErrors('', 'a@b.com', 'existing', '', false))).toEqual(['', '', '', ''])
  })
})

describe('public client configuration', () => {
  it('accepts HTTPS with a public key', () => expect(clientConfigError('https://example.supabase.co', 'sb_publishable_test', false)).toBeNull())
  it.each(['http://example.supabase.co', 'https://user:password@example.com', 'https://example.com/path', 'https://example.com?key=x'])('rejects unsafe project URL %s', url => {
    expect(clientConfigError(url, 'sb_publishable_test', false)).not.toBeNull()
  })
  it('allows loopback HTTP only in development', () => {
    expect(clientConfigError('http://127.0.0.1:54321', 'sb_publishable_test', true)).toBeNull()
    expect(clientConfigError('http://127.0.0.1:54321', 'sb_publishable_test', false)).not.toBeNull()
  })
  it('rejects missing and privileged keys', () => {
    expect(clientConfigError(undefined, undefined, false)).not.toBeNull()
    expect(clientConfigError('https://example.com', 'sb_secret_test', false)).not.toBeNull()
    const jwt = `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`
    expect(clientConfigError('https://example.com', jwt, false)).not.toBeNull()
  })
})
