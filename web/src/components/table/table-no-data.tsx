import Box from "@mui/material/Box";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

type Props = {
  title?: string;
  notFound: boolean;
  sx?: SxProps<Theme>;
};

export default function TableNoData({ title, notFound, sx }: Props) {
  return (
    <TableRow>
      {notFound ? (
        <TableCell colSpan={12} sx={{ p: 0 }}>
          <Box
            sx={{
              py: 3,
              px: 2,
              textAlign: "center",
              color: "text.secondary",
              ...sx,
            }}
          >
            <Typography variant="body2">{title || "No data"}</Typography>
          </Box>
        </TableCell>
      ) : (
        <TableCell colSpan={12} sx={{ p: 0 }} />
      )}
    </TableRow>
  );
}
