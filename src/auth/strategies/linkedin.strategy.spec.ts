import { VerifyCallback } from 'passport-oauth2';
import { LinkedinStrategy } from './linkedin.strategy';

describe('LinkedinStrategy', () => {
  const CONFIG_VALUES: Record<string, string> = {
    'oauth.linkedin.clientId': 'test-client-id',
    'oauth.linkedin.clientSecret': 'test-client-secret',
    'oauth.linkedin.callbackUrl': 'https://api.test/auth/linkedin/callback',
  };

  const buildStrategy = () =>
    new LinkedinStrategy({
      getOrThrow: (key: string) => CONFIG_VALUES[key],
    } as never);

  const buildRawProfile = (overrides: Record<string, unknown> = {}) => ({
    sub: 'linkedin-sub-123',
    email: 'ana@example.com',
    given_name: 'Ana',
    family_name: 'García',
    name: 'Ana García',
    picture: 'https://example.com/avatar.jpg',
    ...overrides,
  });

  it('normaliza un perfil OIDC de LinkedIn completo a OAuthProfile', (done) => {
    const strategy = buildStrategy();
    const verify: VerifyCallback = (error, profile) => {
      expect(error).toBeNull();
      expect(profile).toEqual({
        provider: 'linkedin',
        providerId: 'linkedin-sub-123',
        email: 'ana@example.com',
        firstName: 'Ana',
        lastName: 'García',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
      done();
    };

    strategy.validate('token', 'refresh', buildRawProfile(), verify);
  });

  it('cae a name si LinkedIn no entrega given_name', (done) => {
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
      buildRawProfile({ given_name: undefined, family_name: undefined }),
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
      buildRawProfile({ email: undefined }),
      verify,
    );
  });
});
