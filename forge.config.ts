import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerZIP } from '@electron-forge/maker-zip'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    ignore: [
      /^\/src\//,
      /^\/docs\//,
      /^\/tests\//,
      /^\/native\//,
      /^\/\.github\//,
      /tsconfig.*\.json$/,
      /electron\.vite\.config\.ts$/,
      /forge\.config\.ts$/,
      /\.gitignore$/,
      /CLAUDE\.md$/
    ]
  },
  makers: [
    new MakerDMG({}),
    new MakerSquirrel({}),
    new MakerDeb({}),
    new MakerZIP({})
  ]
}

export default config
