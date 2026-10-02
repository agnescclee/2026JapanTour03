import * as esbuild from 'esbuild';

await esbuild.build({
    entryPoints: ['tools/booking-crypto-fallback.js'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: 'assets/booking-crypto-fallback.js',
    minify: true,
    legalComments: 'none',
    banner: {
        js: '/* Local AES-GCM fallback from @noble/ciphers and @noble/hashes. Contains no booking secrets. */'
    }
});
