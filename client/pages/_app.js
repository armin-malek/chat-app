import "bootstrap/dist/css/bootstrap.css";
import "@/styles/globals.css";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Chat app</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="chat app developed by Armin Esmaeili Malek"
        />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
