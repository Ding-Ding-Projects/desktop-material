import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import assert from 'node:assert'
import { describe, it } from 'node:test'

interface IResponseProvenance {
  readonly url: string
  readonly status: number
  readonly contentType: string
  readonly contentLength: number
  readonly sha256: string
}

interface IFontAsset {
  readonly id: string
  readonly relativePath: string
  readonly bytes: number
  readonly sha256: string
  readonly licenseId: string
  readonly cssRequest: {
    readonly url: string
    readonly status: number
    readonly contentType: string
    readonly bytes: number
    readonly sha256: string
  }
  readonly source: IResponseProvenance
  readonly requestedAxes?: Record<string, ReadonlyArray<number>>
  readonly requestedIconNameCount?: number
  readonly requestedIconNames?: ReadonlyArray<string>
}

interface IFontLicense {
  readonly id: string
  readonly spdx: string
  readonly upstreamUrl: string
  readonly upstreamResponse: {
    readonly status: number
    readonly bytes: number
    readonly sha256: string
  }
  readonly checkedInPath: string
  readonly checkedInBytes: number
  readonly checkedInSha256: string
}

interface IFontManifest {
  readonly schemaVersion: number
  readonly acquisition: {
    readonly method: string
    readonly transformations: string
  }
  readonly licenses: ReadonlyArray<IFontLicense>
  readonly assets: ReadonlyArray<IFontAsset>
}

const root = process.cwd()
const manifestPath = join(
  root,
  'app',
  'styles',
  'fonts',
  'font-assets-manifest.json'
)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as IFontManifest

const sha256 = (contents: Buffer) =>
  createHash('sha256').update(contents).digest('hex')

const canonicalLfTextBytes = (contents: Buffer) =>
  Buffer.from(contents.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')

const expectedAssets = new Map<
  string,
  { readonly bytes: number; readonly sha256: string }
>([
  [
    'roboto-latin-normal-400-700',
    {
      bytes: 43136,
      sha256:
        '1404ca348bd75ef836f4dd8b6f2cc719458642d1237c368296b2fc652dca47dc',
    },
  ],
  [
    'roboto-mono-latin-normal-400-500',
    {
      bytes: 32796,
      sha256:
        'b81cd55177300649be8f95b3b747d721ce607e8ed2856e25bd0c630cfd631faf',
    },
  ],
  [
    'roboto-serif-latin-normal-400-600',
    {
      bytes: 66104,
      sha256:
        'a32deb82e55d4bcb083e09dbb4da3198011ce0e9f919877179e8c2bca23a9042',
    },
  ],
  [
    'roboto-serif-latin-italic-400-600',
    {
      bytes: 72952,
      sha256:
        '14dd8073dcd6e0ce9034ddb9976a29e9d29d3526aff60aa2867b66887c4299fd',
    },
  ],
  [
    'material-symbols-rounded-subset-222',
    {
      bytes: 159608,
      sha256:
        'ec769a345b3ba7c065ccf78d03b3a6548a0f3633a8c4a160785c7810f2f63c0d',
    },
  ],
])

const expectedLicenses = new Map<
  string,
  {
    readonly bytes: number
    readonly sha256: string
    readonly spdx: string
  }
>([
  [
    'roboto-ofl-1.1',
    {
      bytes: 4394,
      sha256:
        '061402327a96aadb0bfb694a960ed289ecd38d383e396243831ab81feb109c41',
      spdx: 'OFL-1.1',
    },
  ],
  [
    'roboto-mono-ofl-1.1',
    {
      bytes: 4395,
      sha256:
        '50ab8dd54680d3473f649c9db86fece88434d097c7834475c1c72d2f8c429215',
      spdx: 'OFL-1.1',
    },
  ],
  [
    'roboto-serif-ofl-1.1',
    {
      bytes: 4396,
      sha256:
        '807add8aba3b132ed3bc40938f1ed4b79f615dcda41d1ca19e8c794b8fd87f81',
      spdx: 'OFL-1.1',
    },
  ],
  [
    'material-symbols-apache-2.0',
    {
      bytes: 11358,
      sha256:
        'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
      spdx: 'Apache-2.0',
    },
  ],
])

const expectedIconNames =
  'accessibility,account_circle,account_tree,add,add_box,add_circle,alt_route,alternate_email,anchor,apps,archive,arrow_back,arrow_downward,arrow_drop_down,arrow_forward,arrow_right,arrow_upward,auto_awesome,autoplay,autorenew,backspace,badge,block,bolt,book_2,book_5,brush,build,build_circle,calendar_month,calendar_today,call_merge,call_split,cancel,category,chat_bubble,check,check_box,check_box_outline_blank,check_circle,checklist,chevron_right,circle,close,cloud,cloud_done,cloud_download,code,code_blocks,commit,construction,content_copy,content_paste,content_paste_go,contrast,crop_square,dark_mode,data_object,database,delete,delete_sweep,deployed_code,description,desktop_windows,devices,difference,disabled_by_default,dns,do_not_disturb_on,done_all,download,drive_file_rename_outline,edit,edit_note,edit_square,error,expand_more,extension,fiber_manual_record,file_copy,filter_alt,filter_alt_off,filter_list,first_page,flag,folder,folder_open,folder_special,folder_zip,fork_right,format_align_center,format_align_left,format_align_right,format_bold,format_italic,format_list_bulleted,format_strikethrough,format_underlined,forum,group,group_add,handyman,help,history,history_toggle_off,home,hourglass_empty,image,inbox,indeterminate_check_box,info,install_desktop,inventory_2,join_inner,key,keyboard_arrow_down,keyboard_arrow_left,keyboard_arrow_right,keyboard_arrow_up,keyboard_double_arrow_down,keyboard_double_arrow_up,keyboard_return,label,last_page,layers,library_add_check,light_mode,lightbulb,link,list,live_help,lock,login,low_priority,manage_history,mark_email_read,mark_email_unread,menu,menu_book,menu_open,merge,merge_type,monitoring,mood,more_horiz,more_vert,notifications,notifications_active,notifications_off,open_in_new,package_2,palette,pause,pause_circle,pending,person,person_add,person_search,play_arrow,play_circle,policy,progress_activity,public,publish,push_pin,rate_review,redo,refresh,remove,repeat,replay,restart_alt,rocket_launch,schedule,school,science,search,search_off,security,sell,send,settings,shield,skip_next,smart_toy,smartphone,sort,space_bar,speed,square,stacks,star,sticky_note_2,stop,subject,swap_horiz,sync,sync_problem,task_alt,terminal,text_fields,text_format,timeline,travel_explore,tune,undo,unfold_less,unfold_more,upload,verified_user,vertical_align_bottom,vertical_split,view_kanban,view_stream,visibility,visibility_off,volume_up,warning,waving_hand,wrap_text,zoom_in,zoom_out'.split(
    ','
  )

describe('bundled Desktop Material fonts', () => {
  it('pins every official WOFF2 byte-for-byte', () => {
    assert.equal(manifest.schemaVersion, 1)
    assert.equal(manifest.assets.length, expectedAssets.size)
    assert.match(manifest.acquisition.method, /Official Google Fonts CSS v2/)
    assert.match(manifest.acquisition.transformations, /^None\./)

    for (const asset of manifest.assets) {
      const expected = expectedAssets.get(asset.id)
      assert.ok(expected !== undefined, `Unexpected asset ${asset.id}`)
      const contents = readFileSync(join(root, asset.relativePath))

      assert.equal(contents.subarray(0, 4).toString('ascii'), 'wOF2')
      assert.equal(contents.length, expected.bytes)
      assert.equal(sha256(contents), expected.sha256)
      assert.equal(asset.bytes, expected.bytes)
      assert.equal(asset.sha256, expected.sha256)
      assert.equal(asset.source.status, 200)
      assert.equal(asset.source.contentType, 'font/woff2')
      assert.equal(asset.source.contentLength, expected.bytes)
      assert.equal(asset.source.sha256, expected.sha256)
      assert.match(asset.source.url, /^https:\/\/fonts\.gstatic\.com\//)
      assert.equal(asset.cssRequest.status, 200)
      assert.equal(asset.cssRequest.contentType, 'text/css; charset=utf-8')
      assert.match(
        asset.cssRequest.url,
        /^https:\/\/fonts\.googleapis\.com\/css2\?/
      )
      assert.match(asset.cssRequest.sha256, /^[a-f0-9]{64}$/)
      assert.ok(asset.cssRequest.bytes > 0)
    }
  })

  it('pins the exact 222-name official Material Symbols request and axes', () => {
    const symbols = manifest.assets.find(
      asset => asset.id === 'material-symbols-rounded-subset-222'
    )
    assert.ok(symbols !== undefined)
    assert.equal(expectedIconNames.length, 222)
    assert.equal(new Set(expectedIconNames).size, 222)
    assert.deepEqual([...expectedIconNames].sort(), expectedIconNames)
    assert.equal(symbols.requestedIconNameCount, 222)
    assert.deepEqual(symbols.requestedIconNames, expectedIconNames)
    assert.match(
      symbols.cssRequest.url,
      new RegExp(`[?&]icon_names=${expectedIconNames.join(',')}&display=swap$`)
    )
    assert.deepEqual(symbols.requestedAxes, {
      opsz: [20, 48],
      wght: [100, 700],
      FILL: [0, 1],
      GRAD: [0, 0],
    })
  })

  it('ships the exact upstream licenses with checked-in hashes', () => {
    assert.equal(manifest.licenses.length, expectedLicenses.size)
    const knownLicenseIds = new Set(
      manifest.licenses.map(license => license.id)
    )

    for (const asset of manifest.assets) {
      assert.ok(knownLicenseIds.has(asset.licenseId))
    }
    for (const license of manifest.licenses) {
      const expected = expectedLicenses.get(license.id)
      assert.ok(expected !== undefined, `Unexpected license ${license.id}`)
      const contents = canonicalLfTextBytes(
        readFileSync(join(root, license.checkedInPath))
      )

      assert.equal(contents.length, expected.bytes)
      assert.equal(sha256(contents), expected.sha256)
      assert.equal(license.checkedInBytes, expected.bytes)
      assert.equal(license.checkedInSha256, expected.sha256)
      assert.equal(license.spdx, expected.spdx)
      assert.equal(license.upstreamResponse.status, 200)
      assert.match(license.upstreamResponse.sha256, /^[a-f0-9]{64}$/)
      assert.match(
        license.upstreamUrl,
        /^https:\/\/raw\.githubusercontent\.com\/google\//
      )
    }
  })

  it('loads local faces before Material tokens and emits them outside static', () => {
    const desktop = readFileSync(
      join(root, 'app', 'styles', 'desktop.scss'),
      'utf8'
    )
    const fonts = readFileSync(
      join(root, 'app', 'styles', '_fonts.scss'),
      'utf8'
    )
    const material = readFileSync(
      join(root, 'app', 'styles', '_material.scss'),
      'utf8'
    )
    const webpack = readFileSync(join(root, 'app', 'webpack.common.ts'), 'utf8')

    assert.ok(desktop.indexOf("@import 'fonts';") > 0)
    assert.ok(
      desktop.indexOf("@import 'fonts';") <
        desktop.indexOf("@import 'material';")
    )
    assert.equal((fonts.match(/@font-face/g) ?? []).length, 5)
    assert.match(
      fonts,
      /font-family: 'Material Symbols Rounded';[^]*?font-display: block;/
    )
    assert.doesNotMatch(fonts, /https?:\/\//)
    for (const asset of manifest.assets) {
      assert.match(fonts, new RegExp(asset.relativePath.split('/').pop()!))
    }
    assert.match(material, /--font-family-monospace: 'Roboto Mono', Consolas,/)
    assert.match(webpack, /test: \/\\\.woff2\$\/i/)
    assert.match(webpack, /type: 'asset\/resource'/)
    assert.match(webpack, /filename: 'fonts\/\[name\]\[ext\]'/)
    assert.doesNotMatch(webpack, /filename: 'static\/fonts/)
  })
})
