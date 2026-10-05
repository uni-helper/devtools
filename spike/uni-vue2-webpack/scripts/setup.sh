#!/usr/bin/env bash
# 安装依赖并修补 uni 构建链的一个已知遮蔽问题。
# 用法：bash scripts/setup.sh
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd -P)" # realpath，见 build.sh 的说明

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -ge 22 ]; then
  echo "!! webpack 4 在 node >= 22 上会崩（Cannot read properties of undefined）" >&2
  echo "!! 请切到 node 16 / 18 / 20 后重试，例如：nvm use 16" >&2
  exit 1
fi

echo "==> project: $PROJECT_DIR (node $(node -v))"
npm install --legacy-peer-deps --no-audit --no-fund

# @dcloudio/vue-cli-plugin-uni/packages/vue-loader 依赖的是 uni 打过补丁的
# @vue/component-compiler-utils@3.1.0，但 npm 扁平安装会把根目录的 vanilla
# 3.3.0 放在解析路径上，导致模板编译缺 recyclableRender → 构建报
# "Export 'recyclableRender' is not defined"。软链把解析指回 uni 的补丁版。
VL="$PROJECT_DIR/node_modules/@dcloudio/vue-cli-plugin-uni/packages/vue-loader"
mkdir -p "$VL/node_modules/@vue"
ln -sfn ../../../@vue/component-compiler-utils \
  "$VL/node_modules/@vue/component-compiler-utils"

echo "==> 依赖就绪，执行 bash scripts/build.sh 构建"
