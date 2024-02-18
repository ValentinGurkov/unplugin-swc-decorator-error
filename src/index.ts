import path from 'path'
import { readFileSync } from 'node:fs'
import { createFilter } from '@rollup/pluginutils'
import { transform } from '@swc/core'
import { defu } from 'defu'
// @ts-expect-error missing types
import { loadTsConfig } from 'load-tsconfig'
import { createUnplugin } from 'unplugin'
import { resolveId } from './resolve'
import type { FilterPattern } from '@rollup/pluginutils'
import type { JscConfig, Options as SwcOptions, TransformConfig } from '@swc/core'

export type Options = SwcOptions & {
  include?: FilterPattern
  exclude?: FilterPattern
  tsconfigFile?: string | boolean
}

type WithRequiredProperty<Type, Key extends keyof Type> = Type & {
  [Property in Key]-?: Type[Property];
}

type SWCOptions = WithRequiredProperty<JscConfig, 'parser' | 'transform'>

export default createUnplugin<Options | undefined>(
  ({ tsconfigFile, minify, include, exclude, ...options } = {}) => {
    const filter = createFilter(
      include || /\.[jt]sx?$/,
      exclude || /node_modules/,
    )

    return {
      name: 'swc',

      resolveId,

      async transform(code, id) {
        if (!filter(id)) return null

        const compilerOptions
          = tsconfigFile === false
            ? {}
            : loadTsConfig(
              path.dirname(id),
              tsconfigFile === true ? undefined : tsconfigFile,
            )?.data?.compilerOptions || {}

        const isTs = /\.tsx?$/.test(id)

        let jsc: SWCOptions = {
          parser: {
            syntax: isTs ? 'typescript' : 'ecmascript',
          },
          transform: {},
        }

        if (compilerOptions.jsx) {
          if (jsc.parser.syntax === 'typescript') {
            jsc.parser.tsx = true
          } else {
            jsc.parser.jsx = true
          }
          Object.assign<TransformConfig, TransformConfig>(jsc.transform, {
            react: {
              pragma: compilerOptions.jsxFactory,
              pragmaFrag: compilerOptions.jsxFragmentFactory,
              importSource: compilerOptions.jsxImportSource,
            },
          })
        }

        if (compilerOptions.experimentalDecorators) {
          // class name is required by type-graphql to generate correct graphql type
          jsc.keepClassNames = true
          jsc.parser.decorators = true
          Object.assign<TransformConfig, TransformConfig>(jsc.transform!, {
            legacyDecorator: true,
            decoratorMetadata: compilerOptions.emitDecoratorMetadata,
          })
        }

        if (compilerOptions.target) {
          jsc.target = compilerOptions.target
        }

        if (options.jsc) {
          jsc = defu<SWCOptions, SWCOptions[]>(options.jsc, jsc)
        }

        const result = await transform(code, {
          filename: id,
          sourceMaps: true,
          ...options,
          jsc,
        })

        // let result
        // if (tsconfigFile === false) { 
        //   const newJsc: any = JSON.parse(readFileSync(path.resolve('./.swcrc')) as any).jsc
        //   result = await transform(code, {
        //     filename: id,
        //     sourceMaps: true,
        //     ...options,
        //     jsc: newJsc,
        //   })
        // } else {
        //   result = await transform(code, {
        //     filename: id,
        //     sourceMaps: true,
        //     ...options,
        //     jsc,
        //   })
        // }

        return {
          code: result.code,
          map: result.map && JSON.parse(result.map),
        }
      },

      vite: {
        config() {
          return {
            esbuild: false,
          }
        },
      },

      rollup: {
        async renderChunk(code, chunk) {
          if (minify) {
            const result = await transform(code, {
              sourceMaps: true,
              minify: true,
              filename: chunk.fileName,
            })
            return {
              code: result.code,
              map: result.map,
            }
          }
          return null
        },
      },
    }
  },
)
