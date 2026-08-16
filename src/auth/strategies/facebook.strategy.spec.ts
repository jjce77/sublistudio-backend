import { Profile, VerifyCallback } from 'passport-facebook';
import { FacebookStrategy } from './facebook.strategy';

describe('FacebookStrategy', () => {
  const CONFIG_VALUES: Record<string, string> = {
    'oauth.facebook.clientId': 'test-client-id',
    'oauth.facebook.clientSecret': 'test-client-secret',
    'oauth.facebook.callbackUrl': 'https://api.test/auth/facebook/callback',
  };

  const buildStrategy = () =>
    new FacebookStrategy({
      getOrThrow: (key: string) => CONFIG_VALUES[key],
    } as never);

  const buildRawProfile = (overrides: Partial<Profile> = {}): Profile =>
    ({
      id: 'facebook-id-123',
      displayName: 'Ana García',
      name: { givenName: 'Ana', familyName: 'García' },
      emails: [{ value: 'ana@example.com' }],
      photos: [{ value: 'https://example.com/avatar.jpg' }],
      ...overrides,
    }) as Profile;

  it('normaliza un perfil de Facebook completo a OAuthProfile', (done) => {
    const strategy = buildStrategy();
    const verify: VerifyCallback = (error, profile) => {
      expect(error).toBeNull();
      expect(profile).toEqual({
        provider: 'facebook',
        providerId: 'facebook-id-123',
        email: 'ana@example.com',
        firstName: 'Ana',
        lastName: 'García',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
      done();
    };

    strategy.validate('token', 'refresh', buildRawProfile(), verify);
  });

  it('cae a displayName si Facebook no entrega name.givenName', (done) => {
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
