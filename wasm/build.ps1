Set-Location -Path $PSScriptRoot

Remove-Item -Path recursion.js -ErrorAction SilentlyContinue
Remove-Item -Path recursion.wasm -ErrorAction SilentlyContinue

emcc ../engine/engine.cpp -O2 `
"-sEXPORTED_FUNCTIONS=@exports.txt" `
"-sEXPORTED_RUNTIME_METHODS=cwrap,getValue" `
-o recursion.js

Write-Host "Build complete!"