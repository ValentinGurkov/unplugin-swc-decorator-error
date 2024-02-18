
import { IsDefined } from "class-validator";

class User {
  @IsDefined()
  name!: string;
}

export const App = () => <div>hi</div>
