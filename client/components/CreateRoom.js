import { useRouter } from "next/router";
import { v1 as uuid } from "uuid";

const CreateRoom = () => {
  const router = useRouter();
  function create() {
    const id = uuid();
    router.push(id);
  }

  return <button onClick={create}>Create Room</button>;
};

export default CreateRoom;
