import { useState, type SubmitEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { cn } from "cn"

import { Button } from "@shared/ui/button"
import { Card, CardContent } from "@shared/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@shared/ui/input-otp"
import { QRCode } from "@shared/ui/qr-code"

import {
  classifyMfaFailure,
  loginErrorMessage,
  useLogin,
  useVerifyMfa,
} from "@/lib/auth"

const CODE_LENGTH = 6

type Step =
  | { kind: "credentials"; notice?: string }
  | { kind: "code"; pendingToken: string; otpauthUri?: string; notice?: string }

// otpauth://totp/ISSUER:user?secret=XXXX — the secret lets someone type it in
// when they can't scan the screen.
function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? ""
  } catch {
    return ""
  }
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [step, setStep] = useState<Step>({ kind: "credentials" })
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")

  const login = useLogin()
  const verify = useVerifyMfa()
  const navigate = useNavigate()
  const location = useLocation()

  // Set by RequireAuth once it exists; harmless until then.
  const from = (location.state as { from?: string } | null)?.from ?? "/"

  const submitCredentials = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    login.mutate(
      { username, password },
      {
        onSuccess: (result) => {
          setPassword("")
          setCode("")
          setStep({
            kind: "code",
            pendingToken: result.pendingToken,
            ...(result.otpauthUri ? { otpauthUri: result.otpauthUri } : {}),
          })
        },
      }
    )
  }

  const submitCode = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step.kind !== "code") return

    verify.mutate(
      { pendingToken: step.pendingToken, code },
      {
        onSuccess: () => navigate(from, { replace: true }),

        onError: (error) => {
          const failure = classifyMfaFailure(error)
          setCode("")

          // The 5-minute pending token is gone — restart, keeping the username.
          if (failure === "expired") {
            setStep({
              kind: "credentials",
              notice: "That took too long. Please sign in again.",
            })
            return
          }

          setStep({
            ...step,
            notice:
              failure === "reused"
                ? "That code was already used. Wait for the next one."
                : failure === "rate-limited"
                  ? "Too many attempts. Try again in a minute."
                  : "That code didn't work. Check the app and try again.",
          })
        },
      }
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          {step.kind === "credentials" ? (
            <form className="p-6 md:p-8" onSubmit={submitCredentials}>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">Sign in</h1>
                  <p className="text-balance text-muted-foreground">
                    Operator access to Olympia Custom
                  </p>
                </div>
                <Field>
                  <FieldLabel htmlFor="username">Username</FieldLabel>
                  <Input
                    id="username"
                    autoComplete="username"
                    placeholder="ADMIN"
                    autoFocus
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
                {login.isError && (
                  <FieldError>{loginErrorMessage(login.error)}</FieldError>
                )}
                {step.notice && <FieldError>{step.notice}</FieldError>}
                <Field>
                  <Button type="submit" disabled={login.isPending}>
                    {login.isPending ? "Signing in…" : "Continue"}
                  </Button>
                </Field>
                <FieldDescription className="text-center">
                  Have an invite?{" "}
                  <Link to="/signup" className="underline underline-offset-2">
                    Create your account
                  </Link>
                </FieldDescription>
              </FieldGroup>
            </form>
          ) : (
            <form className="p-6 md:p-8" onSubmit={submitCode}>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">
                    {step.otpauthUri
                      ? "Set up your authenticator"
                      : "Two-factor code"}
                  </h1>
                  <p className="text-balance text-muted-foreground">
                    {step.otpauthUri
                      ? "Scan this with your authenticator app, then enter the 6-digit code it shows."
                      : "Enter the 6-digit code from your authenticator app."}
                  </p>
                </div>

                {step.otpauthUri && (
                  <div className="flex flex-col items-center gap-3">
                    <QRCode
                      value={step.otpauthUri}
                      title="Authenticator setup QR code"
                    />
                    {secretFromUri(step.otpauthUri) && (
                      <FieldDescription className="text-center">
                        Can&apos;t scan it? Enter this key manually:
                        <code className="mt-1 block font-mono text-xs break-all">
                          {secretFromUri(step.otpauthUri)}
                        </code>
                      </FieldDescription>
                    )}
                  </div>
                )}

                <Field>
                  <FieldLabel htmlFor="code">Code</FieldLabel>
                  <InputOTP
                    id="code"
                    maxLength={CODE_LENGTH}
                    value={code}
                    onChange={setCode}
                    autoFocus
                  >
                    <InputOTPGroup>
                      {Array.from({ length: CODE_LENGTH }, (_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </Field>

                {step.notice && <FieldError>{step.notice}</FieldError>}

                <Field className="gap-4">
                  <Button
                    type="submit"
                    disabled={code.length !== CODE_LENGTH || verify.isPending}
                  >
                    {verify.isPending ? "Verifying…" : "Confirm"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep({ kind: "credentials" })}
                  >
                    Start over
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          )}

          <div className="relative hidden bg-muted md:block">
            <img
              src="/placeholder.svg"
              alt=""
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}