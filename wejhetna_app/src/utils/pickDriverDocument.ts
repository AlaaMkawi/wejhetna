import { launchCamera, launchImageLibrary } from "react-native-image-picker";

import {

  pick,

  keepLocalCopy,

  types,

  errorCodes,

  isErrorWithCode,

} from "@react-native-documents/picker";

import { uploadAssetToS3Presigned } from "../api/upload";

import { appAlert } from "./appAlert";



export type PickerAssetLike = {

  uri: string;

  fileName?: string | null;

  type?: string | null;

  base64?: string | null;

};



export type DriverDocumentPickMode = "document_or_photo" | "photo_only";



const IMAGE_PICKER_OPTS = {

  mediaType: "photo" as const,

  quality: 0.7,

  maxWidth: 1920,

  maxHeight: 1920,

  includeBase64: true,

};



async function uploadFromAsset(asset: PickerAssetLike): Promise<string> {

  await new Promise<void>((r) => setTimeout(r, 0));

  await new Promise<void>((r) => setTimeout(r, 150));

  return uploadAssetToS3Presigned(asset);

}



function isPickerCancelled(e: unknown): boolean {

  return isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED;

}



async function pickFromCamera(): Promise<string | null> {

  return new Promise((resolve, reject) => {

    launchCamera({ ...IMAGE_PICKER_OPTS, saveToPhotos: true }, async (res) => {

      if (res.didCancel || res.errorCode) {

        resolve(null);

        return;

      }

      const asset = res.assets?.[0];

      if (!asset?.uri) {

        reject(new Error("Invalid camera asset"));

        return;

      }

      try {

        const url = await uploadFromAsset({

          uri: asset.uri,

          fileName: asset.fileName,

          type: asset.type,

          base64: (asset as { base64?: string }).base64,

        });

        resolve(url);

      } catch (e: unknown) {

        reject(e);

      }

    });

  });

}



async function pickFromGallery(): Promise<string | null> {

  return new Promise((resolve, reject) => {

    launchImageLibrary({ ...IMAGE_PICKER_OPTS, selectionLimit: 1 }, async (res) => {

      if (res.didCancel || res.errorCode) {

        resolve(null);

        return;

      }

      const asset = res.assets?.[0];

      if (!asset?.uri) {

        reject(new Error("Invalid gallery asset"));

        return;

      }

      try {

        const url = await uploadFromAsset({

          uri: asset.uri,

          fileName: asset.fileName,

          type: asset.type,

          base64: (asset as { base64?: string }).base64,

        });

        resolve(url);

      } catch (e: unknown) {

        reject(e);

      }

    });

  });

}



async function pickFromDocuments(): Promise<string | null> {

  try {

    const [file] = await pick({

      type: [types.pdf, types.images],

      allowMultiSelection: false,

    });

    if (!file?.uri) return null;



    const name = file.name || "document.pdf";

    const [copyResult] = await keepLocalCopy({

      files: [{ uri: file.uri, fileName: name }],

      destination: "cachesDirectory",

    });

    if (copyResult.status !== "success") return null;



    const mime =

      file.type ||

      (name.toLowerCase().endsWith(".pdf")

        ? "application/pdf"

        : "application/octet-stream");



    return uploadFromAsset({

      uri: copyResult.localUri,

      fileName: name,

      type: mime,

    });

  } catch (e: unknown) {

    if (isPickerCancelled(e)) return null;

    throw e;

  }

}



type PickLabels = {

  title: string;

  message: string;

  camera: string;

  gallery: string;

  document: string;

  cancel: string;

};



/**

 * Shows source chooser then uploads to S3. Returns final file_url or null if cancelled.

 */

export function promptPickAndUploadDriverDocument(

  mode: DriverDocumentPickMode,

  labels: PickLabels,

  callbacks: {

    onUploadStart: () => void;

    onUploadEnd: () => void;

    onSuccess: (fileUrl: string) => void;

    onError: (message: string) => void;

  }

): void {

  const run = async (source: "camera" | "gallery" | "document") => {

    callbacks.onUploadStart();

    try {

      let url: string | null = null;

      if (source === "camera") url = await pickFromCamera();

      else if (source === "gallery") url = await pickFromGallery();

      else url = await pickFromDocuments();

      if (url) callbacks.onSuccess(url);

    } catch (e: unknown) {

      if (isPickerCancelled(e)) return;

      const msg = e instanceof Error ? e.message : String(e);

      callbacks.onError(msg);

    } finally {

      callbacks.onUploadEnd();

    }

  };



  const buttons =

    mode === "photo_only"

      ? [

          { text: labels.cancel, style: "cancel" as const },

          { text: labels.camera, onPress: () => void run("camera") },

          { text: labels.gallery, onPress: () => void run("gallery") },

        ]

      : [

          { text: labels.cancel, style: "cancel" as const },

          { text: labels.camera, onPress: () => void run("camera") },

          { text: labels.gallery, onPress: () => void run("gallery") },

          { text: labels.document, onPress: () => void run("document") },

        ];



  appAlert(labels.title, labels.message, buttons);

}


