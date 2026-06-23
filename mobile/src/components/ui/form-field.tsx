import { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

interface FormFieldProps extends TextInputProps {
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  textarea?: boolean;
}

const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  { containerStyle, inputStyle, label, labelStyle, style, textarea = false, ...inputProps },
  ref,
) {
  const textAlignVertical = inputProps.textAlignVertical ?? (textarea ? 'top' : undefined);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, labelStyle]}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor="#8c9a86"
        {...inputProps}
        style={[styles.input, textarea && styles.textarea, style, inputStyle]}
        textAlignVertical={textAlignVertical}
      />
    </View>
  );
});

export default FormField;

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#60705d',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d7ddcf',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#243224',
  },
  textarea: { minHeight: 90 },
});
