# Windows build compatibility

FastStream's vendored `miniglob.mjs` must keep `cleanGlobPath` as a single-argument function. Passing or shadowing `volumeNameLen` causes Node.js 24 on Windows to throw `TypeError: volumeNameLen is not a function` during `npm run build`.

Validated command sequence:

```powershell
npm test
npm run build
```
