import { Profile, VerifyCallback } from 'passport-google-oauth20';
import { GoogleStrategy } from './google.strategy';

// Cubre lo que antes probaba google-oauth.provider.spec.ts — la normalización ahora vive
// dentro de GoogleStrategy.validate() en vez de en una clase aparte.
describe('GoogleStrategy', () => {
  const CONFIG_VALUES: Record<string, string> = {
    'oauth.google.clientId': 'test-client-id',
    'oauth.google.clientSecret': 'test-client-secret',
    'oauth.google.callbackUrl': 'https://api.test/auth/google/callback',
  };

  const buildStrategy = () =>
    new GoogleStrategy({
      getOrThrow: (key: string) => CONFIG_VALUES[key],
    } as never);

  const buildRawProfile = (overrides: Partial<Profile> = {}): Profile =>
    ({
      id: 'google-sub-123',
      displayName: 'Ana García',
      name: { givenName: 'Ana', familyName: 'García' },
      emails: [{ value: 'ana@example.com', verified: true }],
      photos: [{ value: 'https://example.com/avatar.jpg' }],
      ...overrides,
    }) as Profile;

  it('normaliza un perfil de Google completo a OAuthProfile', (done) => {
    const strategy = buildStrategy();
    const verify: VerifyCallback = (error, profile) => {
      expect(error).toBeNull();
      expect(profile).toEqual({
        provider: 'google',
        providerId: 'google-sub-123',
        email: 'ana@example.com',
        firstName: 'Ana',
        lastName: 'García',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
      done();
    };

    strategy.validate('token', 'refresh', buildRawProfile(), verify);
  });

  it('cae a displayName si Google no entrega name.givenName', (done) => {
    const strategy = buildStrategy();
    const verify: VerifyCallback = (_error, profile) => {
      const result = profile as { firstName: string; lastName: string };
      expect(result.firstName).toBe('Ana García');
      expect(result.lastName).toBe('');
      done();
    };

    strategy.validate(
      'token',
      'refresh',
      buildRawProfile({ name: undefined }),
      verify,
    );
  });

  it('rechaza (vía done(error)) si el perfil no trae ningún email', (done) => {
    const strategy = buildStrategy();
    const verify: VerifyCallback = (error) => {
      expect(error).toBeInstanceOf(Error);
      done();
    };

    strategy.validate(
      'token',
      'refresh',
      buildRawProfile({ emails: [] }),
      verify,
    );
  });
});
