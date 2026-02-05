import { Component, ReactNode } from "react";
import QRCode from "react-qr-code";

interface SafeQRCodeProps {
  value: string;
  size?: number;
  level?: "L" | "M" | "Q" | "H";
  onError?: () => void;
}

interface SafeQRCodeState {
  hasError: boolean;
}

class SafeQRCode extends Component<SafeQRCodeProps, SafeQRCodeState> {
  constructor(props: SafeQRCodeProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): SafeQRCodeState {
    return { hasError: true };
  }

  componentDidCatch() {
    if (this.props.onError) {
      this.props.onError();
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }

    const { value, size = 200, level = "M" } = this.props;

    return <QRCode value={value} size={size} level={level} />;
  }
}

export default SafeQRCode;
