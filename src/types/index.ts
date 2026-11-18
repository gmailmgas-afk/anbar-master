// Architecture: Cloudflare Central Database <-> Local Client Databases (1 Database per Installed System, up to 15+ Stations)
// Central Cloudflare D1 (anbar.mgas.ir) is the authoritative cloud hub.
// Each installed workstation/client maintains its own local SQLite database (mgas_local.db).

export type RuntimeEnvironment = 'CLOUD_WEB' | 'OFFICE_WIN11' | 'WAREHOUSE_WIN7';

export interface ClientStation {
  station_id: string; // e.g. 'STATION-01' to 'STATION-15'
  station_name: string; // Friendly name (e.g. 'انبار مرکزی و بارگیری', 'دفتر مدیریت عامل')
  department: string;
  assigned_user?: string;
  os: 'Windows 11' | 'Windows 10' | 'Windows 7' | 'Web Client';
  local_db_name: string; // 'mgas_local.db'
  status: 'ONLINE' | 'OFFLINE' | 'SYNCING';
  last_sync_at: string;
  ip_address?: string;
  pending_events: number;
}

export const DEFAULT_CLIENT_STATIONS: ClientStation[] = [
  {
    station_id: 'STATION-01',
    station_name: 'ایستگاه ۱: انبار مرکزی و بارگیری',
    department: 'انبارداری و لجستیک',
    assigned_user: 'قلی‌زاده / حاجی‌وند',
    os: 'Windows 7',
    local_db_name: 'mgas_local.db',
    status: 'ONLINE',
    last_sync_at: new Date().toISOString(),
    ip_address: '192.168.1.101',
    pending_events: 0
  },
  {
    station_id: 'STATION-02',
    station_name: 'ایستگاه ۲: دفتر مدیریت عامل',
    department: 'مدیریت ارشد',
    assigned_user: 'مهندس عمویی',
    os: 'Windows 11',
    local_db_name: 'mgas_local.db',
    status: 'ONLINE',
    last_sync_at: new Date().toISOString(),
    ip_address: '192.168.1.102',
    pending_events: 0
  },
  {
    station_id: 'STATION-03',
    station_name: 'ایستگاه ۳: مدیریت داخلی و هماهنگی',
    department: 'مدیریت داخلی',
    assigned_user: 'خانم کرمی',
    os: 'Windows 11',
    local_db_name: 'mgas_local.db',
    status: 'ONLINE',
    last_sync_at: new Date().toISOString(),
    ip_address: '192.168.1.103',
    pending_events: 0
  },
  {
    station_id: 'STATION-04',
    station_name: 'ایستگاه ۴: امور مالی و حسابداری',
    department: 'حسابداری انبار',
    assigned_user: 'خانم صفایی',
    os: 'Windows 11',
    local_db_name: 'mgas_local.db',
    status: 'ONLINE',
    last_sync_at: new Date().toISOString(),
    ip_address: '192.168.1.104',
    pending_events: 0
  },
  {
    station_id: 'STATION-05',
    station_name: 'ایستگاه ۵: کنترل کیفی و تست شیر',
    department: 'کنترل کیفیت و ایمنی',
    assigned_user: 'خانم حکیمی / کارشناس QC',
    os: 'Windows 10',
    local_db_name: 'mgas_local.db',
    status: 'ONLINE',
    last_sync_at: new Date().toISOString(),
    ip_address: '192.168.1.105',
    pending_events: 0
  }
];

export type UserRole = 'ADMIN' | 'WAREHOUSE_KEEPER' | 'GENERAL_MANAGER' | 'INTERNAL_MANAGER';

export interface User {
  user_id: string;
  username: string;
  password?: undefined; // STRICT: Plain text passwords are strictly forbidden and never stored
  password_hash?: string;
  password_salt?: string;
  is_password_changed?: boolean;
  password_updated_at?: string;
  full_name: string;
  role: UserRole;
  role_title?: string;
  allowed_device_id: string;
  system_id?: string;
  system_name?: string;
  updated_at?: string;
}

export interface DocumentEditPermissionResult {
  allowed: boolean;
  reason?: string;
  isInternalManager: boolean;
  remainingMinutes?: number;
  remainingSeconds?: number;
  restrictionType?: 'DOCUMENT_AGE' | 'SESSION_EXPIRED' | 'ROLE_DENIED';
  maxHoursAllowed?: number;
}

export interface Device {
  device_id: string;
  name: string;
  os: 'Windows 11' | 'Windows 7' | 'Cloudflare Worker Web';
  location: string;
  last_seen_at: string;
}

export interface Category {
  category_id: string;
  name: string;
  code: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  product_id: string;
  sku: string;
  name: string;
  category_id: string;
  unit: string; // عدد، کیلوگرم، بسته، کارتن، متر
  min_stock: number;
  purchase_price: number;
  sale_price: number;
  barcode?: string;
  description?: string;
  warehouse_id?: string;
  shelf_location?: string;
  shelf_letter?: string;
  shelf_number?: number;
  user_edited?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  warehouse_id: string;
  name: string;
  code: string;
  address: string;
  shelf_location?: string; // محل استقرار قفسه (ترکیب حروف انگلیسی و شماره مثلا A1 یا L2)
  shelf_letter?: string;    // منوی حروف: A تا Z
  shelf_number?: number;    // منوی عدد: 1 تا 50
  is_active: boolean;
}

export interface StockItem {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  last_updated_at: string;
}

export type MovementType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'PURCHASE'
  | 'SALE'
  | 'RETURN_IN'
  | 'RETURN_OUT'
  | 'ADJUSTMENT';

export interface StockMovement {
  movement_id: string;
  product_id: string;
  warehouse_id: string;
  to_warehouse_id?: string;
  destination_warehouse_id?: string;
  item_condition?: 'HEALTHY' | 'DEFECTIVE'; // وضعیت شیر/کالا: سالم یا معیوب
  valve_ownership?: 'MGAS' | 'CUSTOMER'; // مالکیت شیرآلات و کالا: ام‌گاز یا مشتری
  customer_id?: string; // شناسه مشتری (در صورت انتساب به شیر مشتریان)
  customer_name?: string; // نام مشتری یا شرکت ام‌گاز
  shelf_location?: string; // محل استقرار قفسه در زمان ثبت سند
  quantity: number; // Positive quantity; movement_type determines sign
  movement_type: MovementType;
  reference_id: string; // e.g. Purchase order ID, Sale invoice ID, or Manual ref
  document_number?: string;
  description?: string;
  unit_price?: number;
  total_price?: number;
  user_id: string;
  created_by_username?: string; // نام کاربری ثبت‌کننده در سیستم
  device_id: string;
  event_id: string;
  party_type?: 'CUSTOMER' | 'SUPPLIER'; // نوع طرف حساب: مشتری (کاردکس تعمیر) یا تأمین‌کننده (موجودی ام‌گاز)
  supplier_id?: string; // شناسه تأمین‌کننده
  supplier_name?: string; // نام تأمین‌کننده
  driver_name?: string; // نام راننده
  plate_number?: string; // شماره پلاک خودرو
  waybill_number?: string; // شماره بارنامه
  linked_kardex_entry_id?: string; // شناسه ردیف متصل در کاردکس تعمیر مشتری
  linked_receipt_id?: string; // شناسه برگه ورود/خروج متصل
  notes?: string;
  created_at: string;
}

export interface Customer {
  customer_id: string;
  name: string;
  company_name?: string;
  manager_name?: string;
  phone: string;
  phone_secondary?: string;
  national_id?: string;
  economic_code?: string;
  postal_code?: string;
  province: string;
  city: string;
  address?: string;
  credit_limit: number;
  current_balance: number; // positive = creditor, negative = debtor
  customer_type: 'عمده' | 'خرده' | 'سازمانی' | 'پیمانکاری';
  notes?: string;
  created_at: string;
  updated_at: string;
  registration_number?: string; // شماره ثبت
  fax?: string;                 // فکس
  employer_phone?: string;      // تلفن کارفرما
  row_index?: number;           // ردیف در فایل اکسل استاندارد
}

export interface Supplier {
  supplier_id: string;
  name: string;
  company_name?: string;
  manager_name?: string;
  contact_person?: string;
  phone: string;
  phone_secondary?: string;
  national_id?: string;
  economic_code?: string;
  postal_code?: string;
  province?: string;
  city?: string;
  address?: string;
  credit_limit: number;
  current_balance: number; // positive = creditor, negative = debtor
  supplier_type?: 'عمده' | 'خرده' | 'سازمانی' | 'پیمانکاری';
  notes?: string;
  created_at: string;
  updated_at: string;
  registration_number?: string; // شماره ثبت
  fax?: string;                 // فکس
  employer_phone?: string;      // تلفن کارفرما
  row_index?: number;           // ردیف
}

export interface Invoice {
  invoice_id: string;
  invoice_number: string;
  invoice_type: 'SALE' | 'PURCHASE';
  customer_id?: string;
  supplier_id?: string;
  party_name?: string;
  warehouse_id: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  final_amount: number;
  status: 'ISSUED' | 'PAID' | 'CANCELLED';
  user_id?: string;
  created_by_username?: string; // نام کاربری صادرکننده در سیستم
  due_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export const CYLINDER_TYPES = [
  'سیلندر 11 کیلویی',
  'سیلندر 8/10 کیلویی',
  'سیلندر 50 کیلویی',
  'سیلندر لیفتراکی',
  'مخزن 20 کیلویی(تپل/دراز)',
  'مخزن 25 کیلویی (تپل/دراز)',
  'مخزن 30 کیلویی(ریکشا/ساده)',
  'مخزن 35 کیلویی (ریکشا/ساده/تپل)',
  'مخزن 60 لیتری',
  'مخزن 80 لیتری',
  'مخزن 105 لیتری',
  'مخزن 125 لیتری',
  'پیکنیک 1/1.5/3 لیتری',
  'پیکنیک 5/6 کیلویی'
] as const;

export type CylinderType = typeof CYLINDER_TYPES[number] | string;
export const DEFAULT_CYLINDER_TYPE: CylinderType = 'سیلندر 11 کیلویی';

export const FORKLIFT_VALVE_TYPES = [
  'بوتان لیفتراکی',
  'پاساری لیفتراکی',
  'ایران گازی لیفتراکی',
  'پرسی لیفتراکی'
] as const;

export type ForkliftValveType = typeof FORKLIFT_VALVE_TYPES[number] | string;

export interface CylinderTankMapping {
  id: string;
  name: string;
  capacity: string;
  category: 'REPAIR' | 'PRODUCTION' | 'BOTH';
  subVariants?: string[];
  is_repairable: boolean;
  is_produced: boolean;

  // Matching Valve configuration
  matching_valve_id?: string;
  matching_valve_name: string;
  matching_valve_sku?: string;
  valves_per_cylinder: number; // e.g. 1 (or 2 for forklift)

  // Secondary valve configuration (e.g. for forklift vapor phase)
  matching_valve_2_id?: string;
  matching_valve_2_name?: string;
  matching_valve_2_sku?: string;

  // Matching Nut configuration
  matching_nut_id?: string;
  matching_nut_name: string;
  matching_nut_sku?: string;
  nuts_per_cylinder: number; // e.g. 1 (or 2 for forklift)

  notes?: string;
  updated_at?: string;
  updated_by?: string;
}

export interface ProductionPartRequirement {
  partType: 'VALVE' | 'NUT';
  product_id: string;
  sku: string;
  name: string;
  roleLabel: string;
  requiredQty: number;
  availableQty: number;
  deficit: number;
  isSufficient: boolean;
}

export interface ProductionPartsAvailabilityResult {
  available: boolean;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  requiredParts: ProductionPartRequirement[];
  missingParts: ProductionPartRequirement[];
  message: string;
}

export const PRODUCTION_CYLINDER_TYPES = [
  'سیلندر 11 کیلویی',
  'سیلندر 8/10 کیلویی',
  'سیلندر 50 کیلویی',
  'سیلندر لیفتراکی',
  'مخزن 20 کیلویی(تپل/دراز)',
  'مخزن 25 کیلویی (تپل/دراز)',
  'مخزن 30 کیلویی(ریکشا/ساده)',
  'مخزن 35 کیلویی (ریکشا/ساده/تپل)',
  'مخزن 60 لیتری',
  'مخزن 80 لیتری',
  'مخزن 105 لیتری',
  'مخزن 125 لیتری',
  'پیکنیک 1/1.5/3 لیتری',
  'پیکنیک 5/6 کیلویی'
] as const;

export type ProductionCylinderType = typeof PRODUCTION_CYLINDER_TYPES[number];
export const DEFAULT_PRODUCTION_CYLINDER_TYPE: ProductionCylinderType = 'سیلندر 11 کیلویی';

export const PRODUCTION_SUB_VARIANTS_MAP: Record<ProductionCylinderType, string[]> = {
  'سیلندر 11 کیلویی': ['استاندارد'],
  'سیلندر 8/10 کیلویی': ['8 کیلویی', '10 کیلویی'],
  'سیلندر 50 کیلویی': ['استاندارد'],
  'سیلندر لیفتراکی': ['استاندارد'],
  'مخزن 20 کیلویی(تپل/دراز)': ['تپل', 'دراز'],
  'مخزن 25 کیلویی (تپل/دراز)': ['تپل', 'دراز'],
  'مخزن 30 کیلویی(ریکشا/ساده)': ['ریکشا', 'ساده'],
  'مخزن 35 کیلویی (ریکشا/ساده/تپل)': ['ریکشا', 'ساده', 'تپل'],
  'مخزن 60 لیتری': ['استاندارد'],
  'مخزن 80 لیتری': ['استاندارد'],
  'مخزن 105 لیتری': ['استاندارد'],
  'مخزن 125 لیتری': ['استاندارد'],
  'پیکنیک 1/1.5/3 لیتری': ['1 لیتری', '1.5 لیتری', '3 لیتری'],
  'پیکنیک 5/6 کیلویی': ['5 کیلویی', '6 کیلویی']
};

export const STANDARD_VALVE_TYPES = [
  'شیر نو استاندارد ام‌گاز',
  'شیر بوتان',
  'شیر پرسی',
  'شیر مخزنی',
  'شیر ریکشا',
  'شیر کپسول ۱۱ کیلویی',
  'شیر بدون سوپاپ / سوپاپ‌دار'
] as const;

export const STANDARD_NUT_TYPES = [
  'مهره 11/25/50 کیلویی بوتانی',
  'مهره 11/25/50 کیلویی پرسی',
  'مهره 11/25/50 کیلویی پاساری',
  'مهره 11/25/50 کیلویی ایرانگازی',
  'مهره تمام مخزن ها',
  'مهره مخزن زاپاس',
  'مهره 2 کیلویی',
  'مهره 5 کیلویی'
] as const;

export interface GasProductionKardexEntry {
  entry_id: string;
  cylinder_type: ProductionCylinderType | string;
  sub_variant?: string; // زیردسته یا مدل تفکیک‌شده (مثلاً 'ریکشا'، 'ساده'، 'تپل'، '1 لیتری'...)
  valve_type?: string; // نوع شیر انتخابی در هنگام ثبت (مثلاً شیر نو استاندارد ام‌گاز، شیر بوتان...)
  valve_type_2?: string; // نوع شیر دوم انتخابی در هنگام ثبت (مخصوص سیلندر لیفتراکی ۲ شیره)
  nut_type?: string; // نوع مهره انتخابی در هنگام ثبت (از اسامی مهره‌های موجود در انبار)
  nut_type_2?: string; // نوع مهره دوم انتخابی در هنگام ثبت (مخصوص سیلندر لیفتراکی ۲ مهره)
  date: string; // تاریخ شمسی (مثلاً 1405/06/20)
  description: string; // شرح عملیات (تولید خط ۱، سفارش عمده، ...)
  transfer_sheet_number: string; // شماره برگه تولید / حواله
  batch_number?: string; // شماره بچ یا سریال
  production_in: number; // ورودی از خط تولید
  dispatch_out: number; // خروج / تحویل / بارگیری
  defect_reject: number; // ضایعات / رد آزمون کنترل کیفی
  stock_balance: number; // مانده موجودی تولید شده در انبار
  shift_name?: 'صبح' | 'عصر' | 'شب' | string; // شیفت کاری
  supervisor?: string; // سرپرست خط تولید
  destination_or_source?: string; // مقصد / مشتری / خط تولید
  notes?: string;
  order_id?: string; // شناسه یا شماره سفارش
  order_status?: 'ORDER_PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; // وضعیت سفارش ساخت و تولید
  order_quantity?: number; // تیراژ سفارشی ثبت‌شده
  customer_name?: string; // نام مشتری یا نمایندگی سفارش‌دهنده
  driver_name?: string; // نام راننده تحویل‌گیرنده
  plate_number?: string; // پلاک خودرو باربری
  waybill_number?: string; // شماره بارنامه
  completed_at?: string; // تاریخ و زمان اتمام کار و تحویل
  completed_by?: string; // کاربر ثبت‌کننده تحویل
  reference_order_id?: string; // شماره سفارش مبدأ برای سند تحویل
  delivery_sheet_number?: string; // شماره حواله تحویل ثبت‌شده
  user_id: string;
  created_by_username?: string;
  device_id: string;
  event_id: string;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
  delete_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface GasKardexEntry {
  entry_id: string;
  customer_id: string;
  customer_name: string;
  cylinder_type?: CylinderType | string; // نوع محصول و سیلندر (۱۱ کیلویی، ۲۵ کیلویی، ۵۰ کیلویی، سیلندر لیفتراکی)
  date: string; // تاریخ (e.g. 1405/06/20)
  description: string; // شرح
  transfer_sheet_number: string; // شماره برگه انتقال
  cylinder_in: number; // ورود سیلندر
  cylinder_out: number; // خروج سیلندر
  scrap_out: number; // خروج ضایعات واقعی (کسر فقط از مانده ضایعات)
  scrap_stock_in?: number; // ذخیره انبار ضایعات (افزایش اتوماتیک مانده ذخیره ضایعات)
  cylinder_balance: number; // مانده سیلندر
  final_scrap_out?: number; // حذف‌شده طبق دستور کاربر (خروج ضایعات ذخیره کلاً حذف گردید)
  scrap_balance: number; // مانده ذخیره ضایعات (کسر فقط از مانده ضایعات با خروج ضایعات واقعی)
  total_cylinder_balance?: number; // اختیاری (قبلی)
  new_valve_in: number; // ورود شیرنو
  new_valve_out: number; // خروج شیرنو
  new_valve_balance: number; // مانده شیرنو
  dispatched?: string; // ارسالی / مشخصات بارنامه و ارسال
  waybill_number?: string; // شماره بارنامه
  used_valve_in: number; // ورود شیرکهنه
  used_valve_out: number; // خروج شیرکهنه
  used_valve_balance: number; // مانده شیرکهنه
  defective: number; // معیوب
  user_id: string;
  created_by_username?: string; // نام کاربری ثبت‌کننده در سیستم
  inspection_id?: string; // پیوند به شناسه ورود و شمارش فیزیکی مهندس حاجی‌وند
  custom_item_name?: string; // عنوان قلم وارده تاییدشده توسط مهندس حاجی‌وند
  valve_subtype?: string; // زیرمدل دقیق شیر (مثلاً بوتانی لیفتراکی، پاساری لیفتراکی...)
  forklift_valve_type?: ForkliftValveType; // نوع دقیق شیر سیلندر لیفتراکی
  valve_items?: Array<{
    valve_name: string;
    valve_category: 'NEW' | 'USED';
    quantity: number;
    direction: 'IN' | 'OUT';
  }>;
  device_id: string;
  event_id: string;
  notes?: string;
  is_deleted?: boolean; // نشانگر انتقال به سطل آشغال
  deleted_at?: string; // زمان انتقال به سطل آشغال
  deleted_by?: string; // کاربر حذف کننده
  delete_reason?: string; // علت حذف
  created_at: string;
  updated_at: string;
}

export interface PurchaseItem {
  item_id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Purchase {
  purchase_id: string;
  supplier_id: string;
  warehouse_id: string;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  status: 'PENDING' | 'RECEIVED' | 'CANCELLED';
  user_id: string;
  device_id: string;
  items: PurchaseItem[];
  created_at: string;
}

export interface SaleItem {
  item_id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Sale {
  sale_id: string;
  customer_id: string;
  warehouse_id: string;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  user_id: string;
  device_id: string;
  items: SaleItem[];
  created_at: string;
}

export type GoodsReceiptType = 'ENTRY' | 'EXIT';

export interface GoodsReceiptItem {
  rowNum: number;
  description: string;
  quantity: number | '';
  quantityInWords: string;
  remarks: string;
  unit?: string;
  itemDescription?: string;
  condition?: 'HEALTHY' | 'DEFECTIVE';
}

export interface GoodsReceiptRecord {
  receipt_id: string;
  receipt_type: GoodsReceiptType;
  form_number: string;
  date: string;
  customer_id?: string;
  customer_name?: string;
  party_type?: 'CUSTOMER' | 'SUPPLIER';
  supplier_id?: string;
  supplier_name?: string;
  movement_id?: string;
  reference_id?: string;
  entry_id?: string;
  party_name: string; // گیرنده در خروج، یا فرستنده در ورود
  vehicle_type: string;
  plate_number: string;
  driver_name: string;
  waybill_number: string;
  items: GoodsReceiptItem[];
  signer_1: string; // مسئول انبار (خروج) یا تحویل گیرنده انبار (ورود)
  signer_2: string; // تحویل گیرنده (خروج) یا تحویل دهنده (ورود)
  signer_3: string; // قسمت مالی (خروج) یا انباردار (ورود)
  signer_4?: string; // امضاء راننده / حامل کالا (ورود و خروج)
  driver_national_id?: string; // شماره کد ملی راننده
  driver_card_or_sheba?: string; // شماره کارت/شبا راننده
  dispatched?: string | number; // مقدار ستون ارسالی کاردکس گاز (متنی)
  scrap_balance?: number; // مانده ضایعات کاردکس گاز
  user_id?: string;
  created_by_username?: string; // نام کاربری ثبت‌کننده در سیستم
  device_id?: string;
  event_id?: string;
  created_at: string;
  updated_at: string;
}

export type InspectionStatus = 'PENDING_COUNT' | 'COUNTED_READY_FOR_KARDEX' | 'KARDEX_REGISTERED' | 'REJECTED';

export interface CustomCylinderItemType {
  id: string;
  name: string;
  category: 'VALVE' | 'CYLINDER' | 'SCRAP' | 'OTHER';
  unit: string;
  description?: string;
  created_at: string;
}

export type CylinderValveItemType =
  | 'VALVE_NEW' // شیر نو
  | 'VALVE_USED' // شیر کهنه
  | 'CYLINDER_11KG' // سیلندر گاز مایع ۱۱ کیلوگرم
  | 'CYLINDER_OTHER' // سایر سیلندرها
  | 'SCRAP' // ضایعات
  | string; // اقلام سفارشی جدید تعریف‌شده توسط کاربر

export interface CylinderValveInspection {
  inspection_id: string;
  form_number: string; // شماره برگه ورود/خروج کالا
  receipt_type: GoodsReceiptType; // 'ENTRY' (ورود) یا 'EXIT' (خروج)
  date: string; // تاریخ شمسی (مثلاً 1405/06/25)
  customer_id?: string;
  customer_name?: string;
  supplier_id?: string;
  supplier_name?: string;
  item_type: CylinderValveItemType;
  item_name: string; // عنوان قلم (مثلا: شیر نو کپسول گاز)
  declared_quantity: number; // مقدار اعلامی بارنامه (مثلا 300)
  actual_healthy_quantity: number; // شمارش واقعی سالم توسط حاجی‌وند (مثلا 290)
  defective_quantity: number; // تعداد معیوب (مثلا 2)
  discrepancy_quantity: number; // کسری بارنامه (مثلا 8 = 300 - 290 - 2)
  driver_name: string; // نام راننده / تحویل دهنده
  plate_number: string; // پلاک خودرو
  waybill_number: string; // شماره بارنامه
  inspector_user_id: string; // USR-003 (مهندس حاجی وند)
  inspector_name: string; // مهندس حاجی وند
  status: InspectionStatus; // 'COUNTED_READY_FOR_KARDEX' یا 'KARDEX_REGISTERED'
  kardex_entry_id?: string; // شناسه ردیف کاردکس متناظر پس از ثبت توسط کرمی/عمویی
  kardex_registered_by?: string; // نام کاربری ثبت‌کننده کاردکس (karami / amouei)
  kardex_registered_at?: string; // تاریخ و زمان ثبت کاردکس
  notes?: string;
  receipt_items?: GoodsReceiptItem[]; // اقلام تفصیلی جهت چاپ برگه رسمی ورود/خروج کالا
  source_type?: 'CUSTOMER' | 'SUPPLIER'; // مشخص‌کننده ورود از طرف حساب (مشتری) یا تأمین‌کننده (شعبه ام گاز)
  valve_breakdown?: {
    valves11kgNew?: any;
    valves11kgUsed?: any;
    valvesForklift22kgNew?: any;
    valvesForklift22kgUsed?: any;
    valvesPicnicNew?: any;
    valvesPicnicUsed?: any;
    valvesPicnic58kgNew?: any;
    valvesPicnic58kgUsed?: any;
    valvesPicnic5kg?: any;
    valvesPicnic2kg?: any;
  };
  total_new_valves?: number;
  total_used_valves?: number;
  created_at: string;
  updated_at: string;
}

export interface SegregatedCustomerValveItem {
  customer_id: string;
  customer_name: string;
  company_name?: string;
  province?: string;
  valve_name: string;
  valve_category: 'NEW' | 'USED';
  quantity_in: number;
  quantity_out: number;
  balance: number;
  mgas_covered?: number;
  last_activity_date: string;
  status_label: string;
  status_type: 'healthy' | 'zero' | 'covered';
}

export interface CustomerValveProfile {
  customer_id: string;
  customer_name: string;
  company_name?: string;
  province?: string;
  total_new_valve_in?: number;      // کل شیر نو وارده
  total_new_valve_out?: number;     // کل شیر نو صادره/مصرفی
  new_valves_balance: number;       // مانده شیر نو طرف حساب در انبار
  total_used_valve_in?: number;     // کل شیر کهنه وارده
  total_used_valve_out?: number;    // کل شیر کهنه صادره/تحویلی
  used_valves_balance: number;      // مانده شیر کهنه طرف حساب در انبار
  mgas_covered_valves: number;      // تعداد شیر نو تامین‌شده از انبار مرکزی ام گاز به دلیل منفی شدن مانده کاردکس
  total_cylinders_in: number;       // کل سیلندرهای ورودی جهت تعمیرات
  total_cylinders_out: number;      // کل سیلندرهای تحویل شده پس از تعمیر
  last_activity_date?: string;
  segregated_items?: SegregatedCustomerValveItem[];
}

// ----------------------------------------------------------------------
// SYNCHRONIZATION ARCHITECTURE TYPES
// ----------------------------------------------------------------------

export type EntityType =
  | 'PRODUCT'
  | 'CATEGORY'
  | 'CUSTOMER'
  | 'SUPPLIER'
  | 'STOCK_MOVEMENT'
  | 'PURCHASE'
  | 'SALE'
  | 'INVOICE'
  | 'GAS_KARDEX'
  | 'GAS_PRODUCTION_KARDEX'
  | 'GOODS_RECEIPT'
  | 'CYLINDER_VALVE_INSPECTION'
  | 'NOTIFICATION'
  | 'SYSTEM'
  | 'SETTING'
  | 'USER';

export type NotificationCategory =
  | 'KARDEX_REPAIR'
  | 'KARDEX_PRODUCTION'
  | 'INVENTORY'
  | 'INVOICE'
  | 'INSPECTION'
  | 'USER'
  | 'SYSTEM';

export interface AppNotification {
  notification_id: string;
  title: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  category: NotificationCategory;
  target_tab?: string;
  actor_user_id?: string;
  actor_name?: string;
  device_id?: string;
  entity_type?: EntityType | string;
  entity_id?: string;
  read_by: string[];
  created_at: string;
}

export type EventType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'STOCK_ADJUST';

export interface SyncEvent {
  event_id: string;               // Globally unique UUID/nanoid
  user_id: string;                // Authoritative user who triggered the action
  device_id: string;              // Device identifier (e.g. OFFICE-PC-001, WAREHOUSE-PC-001)
  event_type: EventType;
  entity_type: EntityType;
  entity_id: string;
  payload: any;                   // Complete entity data or delta
  client_created_at: string;      // Timestamp from client clock
  server_received_at?: string;    // Central API timestamp
  server_sequence?: number;       // Monotonically increasing authoritative sequence (1001, 1002...)
  schema_version: number;         // For future forward/backward migration compatibility
}

export type SyncQueueStatus = 'PENDING' | 'UPLOADING' | 'CONFIRMED' | 'FAILED';

export interface SyncQueueItem {
  queue_id?: string;
  event_id: string;
  status: SyncQueueStatus;
  retry_count: number;
  last_attempt_at?: string;
  next_retry_at?: string;
  error_message?: string;
  created_at: string;
  event: SyncEvent;
  payload?: any;
}

export interface SyncState {
  device_id: string;
  last_server_sequence: number;
  last_synced_at: string;
  pending_events_count: number;
  status: 'ONLINE' | 'SYNCING' | 'OFFLINE' | 'SYNC_ERROR';
  error_message?: string;
}

export interface AuditLog {
  audit_id: string;
  user_id: string;
  device_id: string;
  action: string;
  entity_type: EntityType | 'AUTH' | 'SYNC' | 'SYSTEM';
  entity_id: string;
  event_id?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface SystemSettings {
  company_name: string;
  tax_rate: number;
  currency: string;
  low_stock_alert_threshold: number;
  auto_sync_interval_sec: number;
  max_retry_backoff_sec: number;
}

export interface DesktopDatabaseInfo {
  success: boolean;
  dbPath: string;
  rootDir: string;
  exists: boolean;
  sizeBytes: number;
  sizeFormatted: string;
  environment: RuntimeEnvironment;
  deviceId: string;
  tablesCount: number;
  serverSequence: number;
  pendingEvents: number;
  writable: boolean;
  error?: string;
}

export interface DesktopAPI {
  isDesktop: boolean;
  platform: string;
  electronVersion: string;
  nodeVersion: string;
  getDbInfo: () => Promise<DesktopDatabaseInfo>;
  initDatabase: (envOverride?: RuntimeEnvironment) => Promise<DesktopDatabaseInfo>;
  query: (sql: string, params?: any[]) => Promise<any[]>;
  execute: (sql: string, params?: any[]) => Promise<{ success: boolean }>;
  recordLocalEvent: (event: any) => Promise<{ success: boolean; event_id: string }>;
  purgeLocalDatabase?: (options?: { preserveProducts?: boolean; purgedAt?: string }) => Promise<{ success: boolean }>;
  saveBackupToFile: (options?: any) => Promise<{ success: boolean; destinationPath?: string; cancelled?: boolean }>;
  saveJsonFile?: (fileName: string, content: string | object) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  getBootLogs?: () => Promise<string[]>;
  getLogPaths?: () => Promise<string[]>;
  openLogInNotepad?: () => Promise<boolean>;
  onDatabaseUpdated?: (callback: (data?: any) => void) => () => void;
  notifyKardexChange?: (entry: any) => Promise<boolean>;
  getDiagnostics?: () => Promise<{
    platform: string;
    release: string;
    arch: string;
    isWindows7: boolean;
    electronVersion: string;
    nodeVersion: string;
    chromeVersion: string;
    logPaths: string[];
  }>;
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI;
  }
}

