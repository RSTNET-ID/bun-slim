// ─── Entity ───────────────────────────────────────────────────────────────────

export interface ExampleItem {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  category_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── DTO ──────────────────────────────────────────────────────────────────────

export interface CreateExampleDTO {
  name: string;
  description?: string;
  category_id?: string;
}

export interface UpdateExampleDTO {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive';
  category_id?: string;
}

// ─── Cursor Pagination Query ───────────────────────────────────────────────────

export interface ExampleListQuery {
  /** Cursor (id) sebagai titik awal halaman berikutnya */
  cursor?: string;
  /** Jumlah item per halaman. Default 20, max 100 */
  limit?: number;
  /** Filter status */
  status?: 'active' | 'inactive';
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/** Category yang di-join ke Example untuk lookup */
export interface CategoryItem {
  id: string;
  name: string;
  code: string;
}

/** Example dengan data category ter-join (lookup) */
export interface ExampleWithLookup extends ExampleItem {
  category: CategoryItem | null;
}
