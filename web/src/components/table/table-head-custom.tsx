import type React from "react";
import { forwardRef } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import type { SxProps, Theme } from "@mui/material/styles";

const visuallyHidden = {
  border: 0,
  margin: -1,
  padding: 0,
  width: "1px",
  height: "1px",
  overflow: "hidden",
  position: "absolute",
  whiteSpace: "nowrap",
  clip: "rect(0 0 0 0)",
} as const;

type Props = {
  order?: "asc" | "desc";
  orderBy?: string;
  headLabel: {
    id: string;
    label: React.ReactNode;
    align?: "left" | "right" | "center" | "inherit" | "justify";
    width?: number | string;
    minWidth?: number | string;
    sortable?: boolean;
  }[];
  rowCount?: number;
  numSelected?: number;
  onSort?: (id: string) => void;
  onSelectAllRows?: (checked: boolean) => void;
  sx?: SxProps<Theme>;
};

const TableHeadCustom = forwardRef<HTMLTableSectionElement, Props>(
  ({ order, orderBy, rowCount = 0, headLabel, numSelected = 0, onSort, onSelectAllRows, sx }, ref) => (
    <TableHead ref={ref} sx={sx}>
      <TableRow>
        {onSelectAllRows && (
          <TableCell padding="checkbox">
            <Checkbox
              indeterminate={!!numSelected && numSelected < rowCount}
              checked={!!rowCount && numSelected === rowCount}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => onSelectAllRows(event.target.checked)}
            />
          </TableCell>
        )}

        {headLabel.map((headCell) => (
          <TableCell
            key={headCell.id}
            align={headCell.align || "left"}
            sortDirection={orderBy === headCell.id ? order : false}
            sx={{ width: headCell.width, minWidth: headCell.minWidth }}
          >
            {onSort && headCell.sortable !== false ? (
              <TableSortLabel
                hideSortIcon
                active={orderBy === headCell.id}
                direction={orderBy === headCell.id ? order : "asc"}
                onClick={() => onSort(headCell.id)}
                sx={{ width: 1 }}
                IconComponent={() => (
                  <Box component="span" sx={{ display: "flex", alignItems: "center" }}>
                    {orderBy === headCell.id && (
                      <Box component="span" sx={{ ...visuallyHidden }}>
                        {order === "desc" ? "sorted descending" : "sorted ascending"}
                      </Box>
                    )}
                    <Box component="span" sx={{ ml: "auto" }}>
                      <TableSortLabel direction={orderBy === headCell.id ? order : "asc"} />
                    </Box>
                  </Box>
                )}
              >
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>{headCell.label}</Box>
              </TableSortLabel>
            ) : (
              headCell.label
            )}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  )
);

TableHeadCustom.displayName = "TableHeadCustom";

export default TableHeadCustom;
