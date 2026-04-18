export function emptyRows(page: number, rowsPerPage: number, arrayLength: number) {
  return page ? Math.max(0, (1 + page) * rowsPerPage - arrayLength) : 0;
}

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  const valueA = a[orderBy];
  const valueB = b[orderBy];

  if ((valueB === null || valueB === undefined) && (valueA === null || valueA === undefined)) {
    return 0;
  }

  if (valueA && (valueB === null || valueB === undefined)) {
    return 1;
  }

  if (valueB && (valueA === null || valueA === undefined)) {
    return -1;
  }

  if (typeof valueA === "string" && typeof valueB === "string") {
    const aLower = valueA.toLowerCase();
    const bLower = valueB.toLowerCase();

    if (aLower < bLower) {
      return -1;
    }

    if (aLower > bLower) {
      return 1;
    }

    return 0;
  }

  if (typeof valueA === "number" && typeof valueB === "number") {
    return valueB - valueA;
  }

  if (typeof valueA === "boolean" && typeof valueB === "boolean") {
    if (valueB === valueA) {
      return 0;
    }

    return valueA ? -1 : 1;
  }

  if (valueA instanceof Date && valueB instanceof Date) {
    return valueB.getTime() - valueA.getTime();
  }

  return 0;
}

type Comparable = string | number | boolean | Date | null | undefined;

export function getComparator<Key extends PropertyKey>(
  order: "asc" | "desc",
  orderBy: Key
): (a: Record<Key, Comparable>, b: Record<Key, Comparable>) => number {
  return order === "desc"
    ? (a, b) => -descendingComparator(a, b, orderBy)
    : (a, b) => descendingComparator(a, b, orderBy);
}
