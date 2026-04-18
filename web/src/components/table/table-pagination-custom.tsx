import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TablePagination, { type TablePaginationProps } from "@mui/material/TablePagination";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import type React from "react";

type Props = {
  denseVisible?: boolean;
  dense?: boolean;
  onChangeDense?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  note?: string;
  sx?: SxProps<Theme>;
};

export default function TablePaginationCustom({
  denseVisible,
  dense,
  onChangeDense,
  rowsPerPageOptions = [5, 10, 25, 50, 100],
  note,
  sx,
  ...other
}: Props & TablePaginationProps) {
  return (
    <Box sx={{ position: "relative", ...sx }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2 }}>
        <Typography color="text.secondary" sx={{ width: 1 }} variant="body2">
          {note}
        </Typography>
        <TablePagination
          component="div"
          rowsPerPageOptions={rowsPerPageOptions}
          sx={{
            borderTopColor: "transparent",
            width: 0.9,
          }}
          {...other}
        />
      </Box>
      {denseVisible && onChangeDense && (
        <FormControlLabel
          control={<Switch checked={dense} onChange={onChangeDense} />}
          label="Dense"
          sx={{
            pl: 2,
            py: 1.5,
            top: 0,
            position: {
              sm: "absolute",
            },
          }}
        />
      )}
    </Box>
  );
}
