/**
 * User-facing advertisement API (POST /advertisements).
 */
import { API_BASE_URL as BASE_URL } from "../../config";

export type CreateAdvertisementResponse = {
  id: number;
  image_url: string;
  status: string;
  message: string;
};

export type AdvertisementUserPublic = {
  username: string;
  full_name: string;
};

/** Public listing (GET /advertisements) — approved, non-expired */
export type PublicAdvertisement = {
  id: number;
  image_url: string;
  category_id: number;
  city_id: number;
  description?: string | null;
  user: AdvertisementUserPublic;
  created_at: string;
};

export async function fetchPublicAdvertisements(params?: {
  categoryId?: number;
  cityId?: number;
}): Promise<PublicAdvertisement[]> {
  const qs = new URLSearchParams();
  if (params?.categoryId != null) {
    qs.append("category_id", String(params.categoryId));
  }
  if (params?.cityId != null) {
    qs.append("city_id", String(params.cityId));
  }
  const q = qs.toString();
  const url = `${BASE_URL}/advertisements${q ? `?${q}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

/** Admin: pending row (GET /admin/advertisements/pending) */
export type AdminPendingAdvertisement = {
  id: number;
  image_url: string;
  category_id: number;
  city_id: number;
  description?: string | null;
  user: AdvertisementUserPublic;
  created_at: string;
};

export type AdvertisementAdminActionResponse = {
  id: number;
  status: string;
  message: string;
};

function parseFastApiDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e: any) =>
        typeof e === "string"
          ? e
          : e?.msg != null && e?.loc
            ? `${e.loc.join(".")}: ${e.msg}`
            : JSON.stringify(e)
      )
      .join("\n");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "Request failed";
}

export async function fetchPendingAdvertisements(params: {
  adminUserId: number;
  categoryId?: number | null;
  cityId?: number | null;
}): Promise<AdminPendingAdvertisement[]> {
  const qs = new URLSearchParams();
  qs.append("admin_user_id", String(params.adminUserId));
  if (params.categoryId != null) {
    qs.append("category_id", String(params.categoryId));
  }
  if (params.cityId != null) {
    qs.append("city_id", String(params.cityId));
  }
  const url = `${BASE_URL}/admin/advertisements/pending?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail != null) msg = parseFastApiDetail(j.detail);
    } catch {
      try {
        msg = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function approveAdvertisementAdmin(params: {
  adminUserId: number;
  advertisementId: number;
}): Promise<AdvertisementAdminActionResponse> {
  const res = await fetch(
    `${BASE_URL}/admin/advertisements/${params.advertisementId}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_user_id: params.adminUserId }),
    }
  );
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail != null) msg = parseFastApiDetail(j.detail);
    } catch {
      try {
        msg = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function rejectAdvertisementAdmin(params: {
  adminUserId: number;
  advertisementId: number;
}): Promise<AdvertisementAdminActionResponse> {
  const res = await fetch(
    `${BASE_URL}/admin/advertisements/${params.advertisementId}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_user_id: params.adminUserId }),
    }
  );
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail != null) msg = parseFastApiDetail(j.detail);
    } catch {
      try {
        msg = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function createAdvertisementRequest(params: {
  userId: number;
  categoryId: number;
  cityId: number;
  description?: string;
  imageUri: string;
  imageType?: string | null;
  imageName?: string | null;
}): Promise<CreateAdvertisementResponse> {
  const form = new FormData();
  form.append("user_id", String(params.userId));
  form.append("category_id", String(params.categoryId));
  form.append("city_id", String(params.cityId));
  if (params.description?.trim()) {
    form.append("description", params.description.trim());
  }

  const fileName =
    params.imageName ||
    (params.imageType?.includes("png") ? "photo.png" : "photo.jpg");
  const mime =
    params.imageType && params.imageType.startsWith("image/")
      ? params.imageType
      : fileName.endsWith(".png")
        ? "image/png"
        : "image/jpeg";

  form.append("image", {
    uri: params.imageUri,
    type: mime,
    name: fileName,
  } as any);

  const res = await fetch(`${BASE_URL}/advertisements`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail != null) msg = parseFastApiDetail(j.detail);
    } catch {
      try {
        msg = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
  }

  return res.json();
}
