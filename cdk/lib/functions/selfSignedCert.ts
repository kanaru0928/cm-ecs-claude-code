import {
  ACMClient,
  DeleteCertificateCommand,
  ImportCertificateCommand,
} from "@aws-sdk/client-acm";
import forge from "node-forge";

const acm = new ACMClient({});

type CfnEvent = {
  RequestType: "Create" | "Update" | "Delete";
  PhysicalResourceId?: string;
};

function generateSelfSignedCert(): { cert: string; key: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const region = process.env.AWS_REGION ?? "ap-northeast-1";
  const domain = `*.${region}.elb.amazonaws.com`;

  const attrs = [{ name: "commonName", value: domain }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    {
      name: "subjectAltName",
      altNames: [{ type: 2, value: domain }],
    },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

export const handler = async (event: CfnEvent) => {
  if (event.RequestType === "Delete") {
    const arn = event.PhysicalResourceId;
    if (arn?.startsWith("arn:")) {
      await acm.send(new DeleteCertificateCommand({ CertificateArn: arn }));
    }
    return { PhysicalResourceId: arn };
  }

  const { cert, key } = generateSelfSignedCert();

  const result = await acm.send(
    new ImportCertificateCommand({
      Certificate: Buffer.from(cert),
      PrivateKey: Buffer.from(key),
    }),
  );

  return {
    PhysicalResourceId: result.CertificateArn,
    Data: { CertificateArn: result.CertificateArn },
  };
};
