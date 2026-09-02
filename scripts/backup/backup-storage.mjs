import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return value;
}

function outputArgument() {
  const index = process.argv.indexOf("--output");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error("Informe --output com a pasta externa do backup.");
  }
  return path.resolve(value);
}

function objectPath(prefix, name) {
  return prefix ? `${prefix}/${name}` : name;
}

async function listFolder(storage, bucketId, prefix = "") {
  const objects = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await storage.from(bucketId).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`Não foi possível listar um diretório do bucket ${bucketId}.`);
    }

    for (const entry of data ?? []) {
      const remotePath = objectPath(prefix, entry.name);
      if (entry.id === null) {
        objects.push(...(await listFolder(storage, bucketId, remotePath)));
      } else {
        objects.push(remotePath);
      }
    }

    if (!data || data.length < PAGE_SIZE) break;
  }

  return objects;
}

async function downloadObject(storage, bucketId, remotePath) {
  const { data, error } = await storage.from(bucketId).download(remotePath);
  if (error || !data) {
    throw new Error(`Falha ao baixar um objeto do bucket ${bucketId}.`);
  }
  return Buffer.from(await data.arrayBuffer());
}

async function main() {
  const supabaseUrl = requiredEnvironment("FLUXA_SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("FLUXA_SERVICE_ROLE_KEY");
  const outputRoot = outputArgument();
  const blobsDirectory = path.join(outputRoot, "storage", "blobs");
  await mkdir(blobsDirectory, { recursive: true });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

  if (bucketsError) {
    throw new Error("Não foi possível listar os buckets do Storage.");
  }

  const manifest = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    buckets: [],
    objects: [],
  };

  let totalBytes = 0;
  for (const bucket of buckets ?? []) {
    manifest.buckets.push({
      id: bucket.id,
      name: bucket.name,
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit ?? null,
      allowedMimeTypes: bucket.allowed_mime_types ?? null,
    });

    const remotePaths = await listFolder(supabase.storage, bucket.id);
    for (const remotePath of remotePaths) {
      const contents = await downloadObject(supabase.storage, bucket.id, remotePath);
      const sha256 = createHash("sha256").update(contents).digest("hex");
      const blobPath = path.join(blobsDirectory, sha256);

      await writeFile(blobPath, contents, { flag: "wx" }).catch((error) => {
        if (error?.code !== "EEXIST") throw error;
      });

      manifest.objects.push({
        bucketId: bucket.id,
        objectPath: remotePath,
        blob: `storage/blobs/${sha256}`,
        sha256,
        sizeBytes: contents.byteLength,
      });
      totalBytes += contents.byteLength;
    }
  }

  manifest.summary = {
    bucketCount: manifest.buckets.length,
    objectCount: manifest.objects.length,
    totalBytes,
  };
  await writeFile(
    path.join(outputRoot, "storage-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx" },
  );

  console.log(
    `Storage concluído: ${manifest.summary.bucketCount} bucket(s), ` +
      `${manifest.summary.objectCount} objeto(s), ${totalBytes} byte(s).`,
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Falha desconhecida no backup do Storage.",
  );
  process.exitCode = 1;
});
