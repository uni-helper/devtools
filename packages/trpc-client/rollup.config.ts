import path from 'node:path'
import process from 'node:process'
import nodeResolve from '@rollup/plugin-node-resolve'
import type { RollupOptions } from 'rollup'
import del from 'rollup-plugin-delete'
import multiInput from 'rollup-plugin-multi-input'
import externals from 'rollup-plugin-node-externals'
import { swc } from 'rollup-plugin-swc3'
import typescript from 'rollup-plugin-typescript2'

const isWatchMode = process.argv.includes('--watch')
const extensions = ['.ts', '.tsx']

interface Options {
  input: string[]
  packageDir: string
}

function buildConfig({ input, packageDir }: Options): RollupOptions[] {
  const resolvedInput = input.map(file => path.resolve(packageDir, file))
  const options: Options = {
    input: resolvedInput,
    packageDir,
  }

  return [types(options), lib(options)]
}

function types({ input, packageDir }: Options): RollupOptions {
  return {
    input,
    output: {
      dir: `${packageDir}/dist`,
    },
    plugins: [
      !isWatchMode
      && del({
        targets: `${packageDir}/dist`,
      }),
      multiInput({ relative: path.resolve(packageDir, 'src/') }),
      externals({
        packagePath: path.resolve(packageDir, 'package.json'),
        deps: true,
        devDeps: true,
        peerDeps: true,
      }),
      typescript({
        tsconfig: path.resolve(packageDir, 'tsconfig.build.json'),
        tsconfigOverride: { emitDeclarationOnly: true },
        abortOnError: !isWatchMode,
      }),
    ],
  }
}

function lib({ input, packageDir }: Options): RollupOptions {
  return {
    input,
    output: [
      {
        dir: `${packageDir}/dist`,
        format: 'cjs',
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
      },
      {
        dir: `${packageDir}/dist`,
        format: 'esm',
        entryFileNames: '[name].mjs',
        chunkFileNames: '[name]-[hash].mjs',
      },
    ],
    plugins: [
      multiInput({ relative: path.resolve(packageDir, 'src/') }),
      externals({
        packagePath: path.resolve(packageDir, 'package.json'),
      }),
      // eslint-disable-next-line ts/ban-ts-comment
      // @ts-expect-error
      nodeResolve({
        extensions,
      }),
      swc({
        tsconfig: false,
        jsc: {
          target: 'es2020',
          transform: {
            react: {
              useBuiltins: true,
            },
          },
          externalHelpers: true,
        },
      }),
    ],
  }
}

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input: [
      'src/index.ts',
      'src/links/httpLink.ts',
      'src/links/httpBatchLink.ts',
      'src/links/splitLink.ts',
      'src/links/loggerLink.ts',
      'src/links/wsLink.ts',
      'src/shared/index.ts',
    ],
    packageDir: './',
  })
}
