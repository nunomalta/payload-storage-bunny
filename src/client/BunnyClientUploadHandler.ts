'use client'
import { createClientUploadHandler } from '@payloadcms/plugin-cloud-storage/client'

export type BunnyClientUploadHandlerExtra = {
  storage: {
    apiKey: string
    hostname: string
    region?: string
    zoneName: string
  }
  stream?: {
    apiKey: string
    hostname: string
    libraryId: string
    thumbnailTime?: number
  }
}

// Helper function to get storage URL (copied from utils.ts)
const getStorageUrl = (region: string | undefined) => {
  if (!region) {
    return 'storage.bunnycdn.com'
  }
  return `${region}.storage.bunnycdn.com`
}

export const BunnyClientUploadHandler = createClientUploadHandler<BunnyClientUploadHandlerExtra>({
  handler: async ({
    apiRoute,
    collectionSlug,
    extra,
    file,
    prefix,
    serverHandlerPath,
    serverURL,
  }) => {
    const isVideoFile = file.type.startsWith('video/')
    
    try {
      if (extra.stream && isVideoFile) {
        // For video files, we need to get a signed URL from the server first
        const authResponse = await fetch(`${serverURL}${apiRoute}${serverHandlerPath}`, {
          body: JSON.stringify({
            collectionSlug,
            filename: file.name,
            isVideoFile: true,
            mimeType: file.type,
          }),
          credentials: 'include',
          method: 'POST',
        })

        if (!authResponse.ok) {
          throw new Error('Failed to get video upload authorization')
        }

        const { videoId } = await authResponse.json() as { videoId: string }
        
        // Upload directly to Bunny Stream
        const uploadUrl = `https://video.bunnycdn.com/library/${extra.stream.libraryId}/videos/${videoId}`
        
        const uploadResponse = await fetch(uploadUrl, {
          body: file,
          headers: {
            'AccessKey': extra.stream.apiKey,
            'Content-Type': file.type,
          },
          method: 'PUT',
        })

        if (!uploadResponse.ok) {
          throw new Error(`Video upload failed: ${uploadResponse.statusText}`)
        }

        return {
          bunnyVideoId: videoId,
          prefix,
        }
      } else {
        // For regular files, upload directly to Bunny Storage
        const filePath = prefix ? `${prefix}/${file.name}` : file.name
        const hostname = getStorageUrl(extra.storage.region)
        const uploadUrl = `https://${hostname}/${extra.storage.zoneName}/${filePath}`

        const uploadResponse = await fetch(uploadUrl, {
          body: file,
          headers: {
            'AccessKey': extra.storage.apiKey,
            'Content-Type': file.type,
          },
          method: 'PUT',
        })

        if (!uploadResponse.ok) {
          throw new Error(`File upload failed: ${uploadResponse.statusText}`)
        }

        return {
          bunnyVideoId: null,
          prefix,
        }
      }
    } catch (error) {
      console.error('Upload error:', error)
      throw error
    }
  },
})
