import type { ClientUploadsAccess } from '@payloadcms/plugin-cloud-storage/types'
import type { PayloadHandler } from 'payload'

import ky, { HTTPError } from 'ky'
import { posix } from 'node:path'
import { APIError, Forbidden } from 'payload'

import type { BunnyAdapterOptions } from './types.js'

import { getStorageUrl } from './utils.js'

interface Args {
  access?: ClientUploadsAccess
  options: BunnyAdapterOptions
  prefix?: string
}

const defaultAccess: Args['access'] = ({ req }) => !!req.user

export const getClientUploadHandler = ({
  access = defaultAccess,
  options,
  prefix: defaultPrefix = '',
}: Args): PayloadHandler => {
  return async (req) => {
    const formData = await req.formData!()
    
    const file = formData.get('file') as File
    const collectionSlug = formData.get('collectionSlug') as string
    const filename = formData.get('filename') as string
    const mimeType = formData.get('mimeType') as string
    const prefix = (formData.get('prefix') as string) || defaultPrefix

    if (!file || !collectionSlug || !filename || !mimeType) {
      throw new APIError('Missing required fields', 400)
    }

    if (!(await access({ collectionSlug, req }))) {
      throw new Forbidden()
    }

    const filePath = posix.join(prefix, filename)
    const isVideoFile = mimeType.startsWith('video/')

    try {
      // Convert File to ArrayBuffer then to Buffer
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      let bunnyVideoId: string | undefined

      if (options.stream && isVideoFile) {
        // For video files, create a video in Bunny Stream first
        const { guid } = await ky
          .post<{ guid: string }>(`https://video.bunnycdn.com/library/${options.stream.libraryId}/videos`, {
            headers: {
              accept: 'application/json',
              AccessKey: options.stream.apiKey,
              'content-type': 'application/json',
            },
            json: { thumbnailTime: options.stream.thumbnailTime, title: filename },
            timeout: 120000,
          })
          .json()

        // Upload the video
        await ky.put(`https://video.bunnycdn.com/library/${options.stream.libraryId}/videos/${guid}`, {
          body: buffer,
          headers: {
            accept: 'application/json',
            AccessKey: options.stream.apiKey,
          },
          timeout: 120000,
        })

        bunnyVideoId = guid
      } else {
        // For regular files, upload to Bunny Storage
        await ky.put(`https://${getStorageUrl(options.storage.region)}/${options.storage.zoneName}/${filePath}`, {
          body: buffer,
          headers: {
            accept: 'application/json',
            AccessKey: options.storage.apiKey,
            'content-type': mimeType,
          },
          timeout: 120000,
        })
      }

      return Response.json({ 
        success: true,
        bunnyVideoId,
      })
    } catch (err: unknown) {
      if (err instanceof HTTPError) {
        const errorResponse = await err.response.text()
        req.payload.logger.error({
          error: {
            response: errorResponse,
            status: err.response.status,
            statusText: err.response.statusText,
          },
          file: {
            name: filename,
            type: mimeType,
            size: file.size,
          },
          storage: options.storage.zoneName,
        })
      } else {
        req.payload.logger.error({
          error: err,
          file: {
            name: filename,
            type: mimeType,
            size: file.size,
          },
          storage: options.storage.zoneName,
        })
      }

      throw new APIError(`Error uploading file: ${filename}`, 500)
    }
  }
}
