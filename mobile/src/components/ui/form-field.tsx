import { StyleSheet, Text, TextInput, type TextInputProps } from "react-native";

interface FormFieldProps extends TextInputProps {
  label: string;
}

export default function FormField({ label, ...inputProps }: FormFieldProps) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#8c9a86"
        style={styles.input}
        {...inputProps}
      />
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#7b8a75",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d7ddcf",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#243224",
    marginBottom: 6,
  },
});
