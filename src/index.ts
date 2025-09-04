import type {
  Adapter,
  PluginOptions as CloudStoragePluginOptions,
  CollectionOptions,
  GeneratedAdapter,
} from '@payloadcms/plugin-cloud-storage/types'
import type { Config, Field } from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import { initClientUploads } from '@payloadcms/plugin-cloud-storage/utilities'

import type { BunnyPlugin, BunnyStorageOptions } from './types.js'

import { getAdminThumbnail } from './adminThumbnail.js'
import { getGenerateURL } from './generateURL.js'
import { getClientUploadHandler } from './getClientUploadHandler.js'
import { getHandleDelete } from './handleDelete.js'
import { getHandleUpload } from './handleUpload.js'
import { getStaticHandler } from './staticHandler.js'
import { validateOptions } from './utils.js'

export const bunnyStorage: BunnyPlugin =
  (bunnyStorageOptions: BunnyStorageOptions) =>
    (incomingConfig: Config): Config => {
      if (bunnyStorageOptions.enabled === false) {
        return incomingConfig
      }

      validateOptions(bunnyStorageOptions)

      // Initialize client uploads if enabled
      initClientUploads({
        clientHandler: 'storage-bunny/client#BunnyClientUploadHandler',
        collections: bunnyStorageOptions.collections,
        config: incomingConfig,
        enabled: Boolean(bunnyStorageOptions.options.clientUploads),
        extraClientHandlerProps: () => ({
          prefix: '',
        }),
        serverHandler: getClientUploadHandler({
          access: typeof bunnyStorageOptions.options.clientUploads === 'object' 
            ? bunnyStorageOptions.options.clientUploads.access 
            : undefined,
          options: bunnyStorageOptions.options,
          prefix: '',
        }),
        serverHandlerPath: '/bunny-client-upload',
      })

      const adapter = bunnyInternal(bunnyStorageOptions)

      const collectionsWithAdapter: CloudStoragePluginOptions['collections'] = Object.entries(
        bunnyStorageOptions.collections,
      ).reduce(
        (acc, [slug, collOptions]) => ({
          ...acc,
          [slug]: {
            ...(collOptions === true ? {} : collOptions),
            adapter,
          },
        }),
        {} as Record<string, CollectionOptions>,
      )

      const config: Config = {
        ...incomingConfig,
        collections: (incomingConfig.collections || []).map((collection) => {
          if (!collectionsWithAdapter[collection.slug]) {
            return collection
          }

          return {
            ...collection,
            admin: {
              ...(collection.admin || {}),
              components: {
                ...(collection.admin?.components || {}),
                edit: {
                  ...(collection.admin?.components?.edit || {}),
                  ...(bunnyStorageOptions.experimental?.replaceSaveButtonComponent ? {
                    SaveButton: 'storage-bunny/client#CustomSaveButton',
                  } : {}),
                },
              },
            },
            upload: {
              ...(typeof collection.upload === 'object' ? collection.upload : {}),
              ...(bunnyStorageOptions.options.adminThumbnail ? {
                adminThumbnail: getAdminThumbnail(collection, bunnyStorageOptions),
              } : {}),
              disableLocalStorage: true,
            },
          }
        }),
      }

      return cloudStoragePlugin({
        collections: collectionsWithAdapter,
      })(config)
    }

const bunnyInternal = ({ options }: BunnyStorageOptions): Adapter => {
  const fields: Field[] = options.stream
    ? [
      {
        name: 'bunnyVideoId',
        type: 'text',
        admin: {
          disabled: true,
        },
      },
      ...(options.stream.mp4Fallback?.enabled || !!options.stream.mp4FallbackQuality
        ? [
          {
            name: 'bunnyVideoMeta',
            type: 'json' as const,
            hidden: true,
          },
        ]
        : []),
    ]
    : []

  return ({ collection, prefix }): GeneratedAdapter => {
    return {
      name: 'bunny',
      clientUploads: options.clientUploads,
      fields,
      generateURL: getGenerateURL(options),
      handleDelete: getHandleDelete(options),
      handleUpload: getHandleUpload({ ...options, prefix }),
      staticHandler: getStaticHandler({ ...options, collection, prefix }),
    }
  }
}
