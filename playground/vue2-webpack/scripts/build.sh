#!/usr/bin/env bash
# 构建 mp-weixin 产物。默认 dev（输出 dist/dev/mp-weixin）；传 production 走生产构建。
# 用法：bash scripts/build.sh [development|production]
set -euo pipefail

cd "$(dirname "$0")/.."

# UNI_CLI_CONTEXT 必须显式设：uni 自己的 lib/env.js 在 :90 调用 plugin.init() 读它，
# 却在同一文件的 :194 才赋值（时序 bug）。不设会报
# "The "path" argument must be of type string. Received undefined"。
# 必须用 realpath：macOS 的 /tmp 是 /private/tmp 的符号链接，uni 用 require.resolve 的
# realpath 去比对 webpack 的 module.resource，经符号链接进入会比对失败 → 报
# "Cannot read properties of undefined (reading 'id')"。
export UNI_CLI_CONTEXT="$(pwd -P)"
export NODE_ENV="${1:-development}"
export UNI_PLATFORM="${UNI_PLATFORM:-mp-weixin}"

./node_modules/.bin/vue-cli-service uni-build
