import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authMessage, sendMagicLink, signInWithPassword, usesMemoryAuth, watchSession } from "@/lib/erp/auth";

export function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const memory = usesMemoryAuth();

  useEffect(() => watchSession((user) => {
    if (user) navigate("/erp/estoque", { replace: true });
  }), [navigate]);

  async function onPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await signInWithPassword(email, password);
      navigate("/erp/estoque", { replace: true });
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onMagic() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const result = await sendMagicLink(email);
      if (result === "sent") {
        setInfo("Enviamos um link de acesso para esse e-mail.");
      } else {
        navigate("/erp/estoque", { replace: true });
      }
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Entrar no ERP</CardTitle>
          <CardDescription>Acesso da equipe 3DXAP, separado do painel /admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onPassword}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Senha</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
              <Field>
                <Button type="submit" disabled={busy}>Entrar</Button>
              </Field>
              <FieldSeparator>ou</FieldSeparator>
              <Field>
                <Button type="button" variant="outline" disabled={busy || email.trim() === ""} onClick={() => void onMagic()}>
                  Receber link mágico
                </Button>
                <FieldDescription className="text-center">
                  {memory
                    ? "Sem Supabase neste ambiente. O teste aceita o e-mail da Paula ou do Renan e qualquer senha. Nada é gravado na nuvem."
                    : "O link só entra se o e-mail estiver na lista do Supabase."}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
