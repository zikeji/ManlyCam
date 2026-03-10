import { describe, it, expect } from 'vitest';
import { canModerateOver } from './roleUtils.js';
import { ROLE_RANK } from '@manlycam/types';

describe('ROLE_RANK', () => {
  it('Admin has rank 3', () => expect(ROLE_RANK['Admin']).toBe(3));
  it('Moderator has rank 2', () => expect(ROLE_RANK['Moderator']).toBe(2));
  it('ViewerCompany has rank 1', () => expect(ROLE_RANK['ViewerCompany']).toBe(1));
  it('ViewerGuest has rank 0', () => expect(ROLE_RANK['ViewerGuest']).toBe(0));
});

describe('canModerateOver', () => {
  // Admin cases
  it('Admin can moderate Moderator', () =>
    expect(canModerateOver('Admin', 'Moderator')).toBe(true));
  it('Admin can moderate ViewerCompany', () =>
    expect(canModerateOver('Admin', 'ViewerCompany')).toBe(true));
  it('Admin can moderate ViewerGuest', () =>
    expect(canModerateOver('Admin', 'ViewerGuest')).toBe(true));
  it('Admin CANNOT moderate Admin', () => expect(canModerateOver('Admin', 'Admin')).toBe(false));

  // Moderator cases
  it('Moderator can moderate ViewerCompany', () =>
    expect(canModerateOver('Moderator', 'ViewerCompany')).toBe(true));
  it('Moderator can moderate ViewerGuest', () =>
    expect(canModerateOver('Moderator', 'ViewerGuest')).toBe(true));
  it('Moderator CANNOT moderate Moderator', () =>
    expect(canModerateOver('Moderator', 'Moderator')).toBe(false));
  it('Moderator CANNOT moderate Admin', () =>
    expect(canModerateOver('Moderator', 'Admin')).toBe(false));

  // Viewer cases — canModerateOver is a pure rank comparison; viewer gating is enforced separately
  it('ViewerCompany outranks ViewerGuest (rank comparison)', () =>
    expect(canModerateOver('ViewerCompany', 'ViewerGuest')).toBe(true));
  it('ViewerCompany does NOT outrank ViewerCompany', () =>
    expect(canModerateOver('ViewerCompany', 'ViewerCompany')).toBe(false));
  it('ViewerGuest does NOT outrank ViewerGuest', () =>
    expect(canModerateOver('ViewerGuest', 'ViewerGuest')).toBe(false));
  it('ViewerGuest does NOT outrank ViewerCompany', () =>
    expect(canModerateOver('ViewerGuest', 'ViewerCompany')).toBe(false));
});
