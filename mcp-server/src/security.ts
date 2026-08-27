const forbidden = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|execute|prepare|deallocate|vacuum|analyze|refresh|reindex|cluster|comment|security|set|reset|listen|notify|load|lock)\b/i;
const systemAccess = /\b(pg_catalog|information_schema|pg_toast|pg_read_file|pg_ls_dir|dblink|lo_import|lo_export|current_setting)\b/i;

export function validateReadOnlySql(sql: string) {
  const clean = sql.trim().replace(/;\s*$/, "");
  if (clean.length < 6 || clean.length > 4000) throw new Error("Sorgu uzunluğu geçersiz.");
  if (!/^(select|with)\b/i.test(clean)) throw new Error("Sorgu SELECT veya WITH ile başlamalıdır.");
  if (/;/.test(clean)) throw new Error("Birden fazla SQL statement yasaktır.");
  if (/--|\/\*|\*\//.test(clean)) throw new Error("SQL yorumları güvenlik nedeniyle yasaktır.");
  if (forbidden.test(clean) || /\bfor\s+(update|share)\b/i.test(clean)) throw new Error("Yalnızca salt okunur sorgulara izin verilir.");
  if (systemAccess.test(clean)) throw new Error("Sistem tablolarına ve yönetim fonksiyonlarına erişim yasaktır.");
  return clean;
}
