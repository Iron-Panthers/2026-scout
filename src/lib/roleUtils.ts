export function prettifyRole(role: string): string {
  switch (role) {
    case "red1": return "Red 1";
    case "red2": return "Red 2";
    case "red3": return "Red 3";
    case "qualRed": return "Qual Red";
    case "blue1": return "Blue 1";
    case "blue2": return "Blue 2";
    case "blue3": return "Blue 3";
    case "qualBlue": return "Qual Blue";
    default: return "Unknown Role";
  }
}
