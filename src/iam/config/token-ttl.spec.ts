import { parseTokenTtl } from './token-ttl';

describe('parseTokenTtl', () => {
  it.each([
    ['900', 900],
    ['15m', 900],
    ['1h', 3600],
    ['7d', 604800],
    ['2w', 1209600],
  ])('parses %s as seconds', (value, expected) => {
    expect(parseTokenTtl(value, 'TOKEN_TTL')).toBe(expected);
  });

  it.each(['', '7days', '-1h', '0', '1.5h', '500ms'])(
    'rejects invalid duration %s',
    (value) => {
      expect(() => parseTokenTtl(value, 'TOKEN_TTL')).toThrow('TOKEN_TTL');
    },
  );
});
