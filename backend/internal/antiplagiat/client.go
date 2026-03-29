package antiplagiat

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	apiNamespace     = "http://www.antiplagiat.ru/3.0/apicorp"
	soapEnvNamespace = "http://schemas.xmlsoap.org/soap/envelope/"
	soapActionPing   = apiNamespace + "/IApiCorp/Ping"
	soapActionSvc    = apiNamespace + "/IApiCorp/GetCheckServices"
	soapActionUpload = apiNamespace + "/IApiCorp/UploadDocument"
	soapActionCheck  = apiNamespace + "/IApiCorp/CheckDocument"
	soapActionStatus = apiNamespace + "/IApiCorp/GetCheckStatus"
	soapActionPDF    = apiNamespace + "/IApiCorp/ExportReportToPdf"
)

type ClientConfig struct {
	SiteURL  string
	WSDLURL  string
	Login    string
	Password string
}

type Client struct {
	httpClient *http.Client
	cfg        ClientConfig
}

type CheckServiceInfo struct {
	Code        string `json:"code"`
	Description string `json:"description"`
}

type UploadParams struct {
	FileName       string
	FileType       string
	Data           []byte
	ExternalUserID string
	Title          string
	Author         string
	AddToIndex     bool
}

type UploadResult struct {
	DocumentID  int
	FileName    string
	Reason      string
	FailDetails string
}

type CheckStatus struct {
	Status            string
	FailDetails       string
	EstimatedWaitTime *int
	Summary           *ReportSummary
}

type ReportSummary struct {
	ReportNum         int
	Score             float64
	Plagiarism        float64
	Legal             float64
	SelfCite          float64
	Originality       float64
	IsSuspicious      bool
	ReportURL         string
	ReadonlyReportURL string
	ShortReportURL    string
	SummaryReportURL  string
}

type PDFExportResult struct {
	Status            string
	DownloadLink      string
	ReportNum         int
	EstimatedWaitTime *int
}

func NewClient(cfg ClientConfig) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 90 * time.Second},
		cfg:        cfg,
	}
}

func (c *Client) Ping(ctx context.Context) (string, error) {
	var resp pingResponse
	if err := c.call(ctx, soapActionPing, pingRequest{}, &resp); err != nil {
		return "", err
	}
	return strings.TrimSpace(resp.Result), nil
}

func (c *Client) GetCheckServices(ctx context.Context) ([]CheckServiceInfo, error) {
	var resp getCheckServicesResponse
	if err := c.call(ctx, soapActionSvc, getCheckServicesRequest{}, &resp); err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(resp.Result))
	services := make([]CheckServiceInfo, 0, len(resp.Result))
	for _, item := range resp.Result {
		code := strings.TrimSpace(item.Code)
		if code == "" {
			continue
		}
		if _, exists := seen[code]; exists {
			continue
		}
		seen[code] = struct{}{}
		services = append(services, CheckServiceInfo{
			Code:        code,
			Description: strings.TrimSpace(item.Description),
		})
	}
	return services, nil
}

func (c *Client) UploadDocument(ctx context.Context, params UploadParams) (*UploadResult, error) {
	req := uploadDocumentRequest{
		Data: uploadDocData{
			FileName:       params.FileName,
			FileType:       normalizeFileType(params.FileType),
			Data:           base64.StdEncoding.EncodeToString(params.Data),
			ExternalUserID: strings.TrimSpace(params.ExternalUserID),
		},
		Attributes: uploadDocAttributes{
			Name:   strings.TrimSpace(params.Title),
			Url:    "",
			Author: strings.TrimSpace(params.Author),
			DocumentDescription: verificationReportOptions{
				Author:      strings.TrimSpace(params.Author),
				Work:        strings.TrimSpace(params.Title),
				ShortReport: true,
			},
		},
		Options: uploadOptions{
			AddToIndex: params.AddToIndex,
			IndexState: uploadIndexState(params.AddToIndex),
		},
	}
	if req.Attributes.Name == "" {
		req.Attributes.Name = params.FileName
	}
	if req.Attributes.DocumentDescription.Work == "" {
		req.Attributes.DocumentDescription.Work = req.Attributes.Name
	}

	var resp uploadDocumentResponse
	if err := c.call(ctx, soapActionUpload, req, &resp); err != nil {
		return nil, err
	}
	if len(resp.Result.Uploaded) == 0 {
		return nil, fmt.Errorf("upload response did not contain files")
	}
	item := resp.Result.Uploaded[0]
	result := &UploadResult{
		FileName: item.FileName,
		Reason:   item.Reason,
	}
	if item.ID != nil {
		result.DocumentID = item.ID.ID
	}
	if item.FailDetails != nil {
		result.FailDetails = strings.TrimSpace(*item.FailDetails)
	}
	return result, nil
}

func (c *Client) StartCheck(ctx context.Context, documentID int, checkServices []string) error {
	req := checkDocumentRequest{
		DocumentID: documentIDRef{
			ID: documentID,
		},
		CheckServices: normalizeCheckServices(checkServices),
	}
	return c.call(ctx, soapActionCheck, req, &checkDocumentResponse{})
}

func (c *Client) GetCheckStatus(ctx context.Context, documentID int) (*CheckStatus, error) {
	req := getCheckStatusRequest{
		DocumentID: documentIDRef{
			ID: documentID,
		},
	}
	var resp getCheckStatusResponse
	if err := c.call(ctx, soapActionStatus, req, &resp); err != nil {
		return nil, err
	}
	result := &CheckStatus{
		Status:            strings.TrimSpace(resp.Result.Status),
		EstimatedWaitTime: resp.Result.EstimatedWaitTime,
	}
	if resp.Result.FailDetails != nil {
		result.FailDetails = strings.TrimSpace(*resp.Result.FailDetails)
	}
	if resp.Result.Summary != nil {
		result.Summary = &ReportSummary{
			ReportNum:         resp.Result.Summary.ReportNum,
			Score:             resp.Result.Summary.Score,
			Plagiarism:        resp.Result.Summary.DetailedScore.Plagiarism,
			Legal:             resp.Result.Summary.DetailedScore.Legal,
			SelfCite:          resp.Result.Summary.DetailedScore.SelfCite,
			Originality:       resp.Result.Summary.DetailedScore.Unknown,
			IsSuspicious:      resp.Result.Summary.IsSuspicious,
			ReportURL:         c.buildReportURL(resp.Result.Summary.ReportWebID),
			ReadonlyReportURL: c.buildReportURL(resp.Result.Summary.ReadonlyReportWebID),
			ShortReportURL:    c.buildReportURL(resp.Result.Summary.ShortReportWebID),
			SummaryReportURL:  c.buildReportURL(resp.Result.Summary.SummaryReportWebID),
		}
	}
	return result, nil
}

func (c *Client) ExportReportToPDF(ctx context.Context, documentID, reportNum int, short bool) (*PDFExportResult, error) {
	req := exportReportToPDFRequest{
		DocumentID: documentIDRef{
			ID: documentID,
		},
		Options: exportReportOptions{
			ReportNum:   reportNum,
			ShortReport: short,
			FormattingOptions: formattingOptions{
				Language: "ru",
			},
		},
	}
	var resp exportReportToPDFResponse
	if err := c.call(ctx, soapActionPDF, req, &resp); err != nil {
		return nil, err
	}
	result := &PDFExportResult{
		Status:            strings.TrimSpace(resp.Result.Status),
		ReportNum:         resp.Result.ReportNum,
		EstimatedWaitTime: resp.Result.EstimatedWaitTime,
		DownloadLink:      c.buildReportURL(resp.Result.DownloadLink),
	}
	return result, nil
}

func (c *Client) call(ctx context.Context, action string, payload any, out any) error {
	reqEnvelope := soapRequestEnvelope{
		SoapEnv: soapEnvNamespace,
		AP:      apiNamespace,
		XSI:     "http://www.w3.org/2001/XMLSchema-instance",
		Body: soapRequestBody{
			Payload: payload,
		},
	}

	body, err := xml.Marshal(reqEnvelope)
	if err != nil {
		return fmt.Errorf("marshal soap request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, serviceURL(c.cfg.WSDLURL), bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build soap request: %w", err)
	}
	req.SetBasicAuth(c.cfg.Login, c.cfg.Password)
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")
	req.Header.Set("SOAPAction", fmt.Sprintf("%q", action))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send soap request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read soap response: %w", err)
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("antiplagiat authorization failed")
	}
	if resp.StatusCode >= http.StatusBadRequest && !bytes.Contains(respBody, []byte("<Fault")) {
		return fmt.Errorf("antiplagiat http error: %s", resp.Status)
	}

	var envelope soapResponseEnvelope
	if err := xml.Unmarshal(respBody, &envelope); err != nil {
		return fmt.Errorf("decode soap envelope: %w", err)
	}
	if envelope.Body.Fault != nil {
		msg := strings.TrimSpace(envelope.Body.Fault.String)
		if detail := strings.TrimSpace(envelope.Body.Fault.Detail.Any.Message); detail != "" {
			msg = detail
		}
		if msg == "" {
			msg = "antiplagiat soap fault"
		}
		return errors.New(msg)
	}
	if out == nil || len(envelope.Body.Content) == 0 {
		return nil
	}
	if err := xml.Unmarshal(envelope.Body.Content, out); err != nil {
		return fmt.Errorf("decode soap payload: %w", err)
	}
	return nil
}

func (c *Client) buildReportURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return raw
	}
	base := strings.TrimRight(strings.TrimSpace(c.cfg.SiteURL), "/")
	if base == "" {
		return raw
	}
	if strings.HasPrefix(raw, "/") {
		return base + raw
	}
	return base + "/" + raw
}

func normalizeFileType(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return ""
	}
	if strings.HasPrefix(value, ".") {
		return value
	}
	return "." + value
}

func serviceURL(wsdl string) string {
	wsdl = strings.TrimSpace(wsdl)
	wsdl = strings.TrimSuffix(wsdl, "?wsdl")
	return wsdl
}

type soapRequestEnvelope struct {
	XMLName xml.Name        `xml:"soapenv:Envelope"`
	SoapEnv string          `xml:"xmlns:soapenv,attr"`
	AP      string          `xml:"xmlns:ap,attr"`
	XSI     string          `xml:"xmlns:xsi,attr,omitempty"`
	Body    soapRequestBody `xml:"soapenv:Body"`
}

type soapRequestBody struct {
	Payload any `xml:",omitempty"`
}

type soapResponseEnvelope struct {
	Body struct {
		Fault   *soapFault `xml:"Fault"`
		Content []byte     `xml:",innerxml"`
	} `xml:"Body"`
}

type soapFault struct {
	Code   string          `xml:"faultcode"`
	String string          `xml:"faultstring"`
	Detail soapFaultDetail `xml:"detail"`
}

type soapFaultDetail struct {
	Any struct {
		Message string `xml:"Message"`
	} `xml:",any"`
}

type pingRequest struct {
	XMLName xml.Name `xml:"ap:Ping"`
}

type pingResponse struct {
	Result string `xml:"PingResult"`
}

type getCheckServicesRequest struct {
	XMLName xml.Name `xml:"ap:GetCheckServices"`
}

type getCheckServicesResponse struct {
	Result []checkServiceInfo `xml:"GetCheckServicesResult>CheckServiceInfo"`
}

type checkServiceInfo struct {
	Code        string `xml:"Code"`
	Description string `xml:"Description"`
}

type uploadDocumentRequest struct {
	XMLName    xml.Name            `xml:"ap:UploadDocument"`
	Data       uploadDocData       `xml:"ap:data"`
	Attributes uploadDocAttributes `xml:"ap:attributes"`
	Options    uploadOptions       `xml:"ap:options"`
}

type uploadDocData struct {
	FileName       string `xml:"ap:FileName"`
	FileType       string `xml:"ap:FileType"`
	Data           string `xml:"ap:Data"`
	ExternalUserID string `xml:"ap:ExternalUserID,omitempty"`
}

type uploadDocAttributes struct {
	Name                string                    `xml:"ap:Name"`
	Url                 string                    `xml:"ap:Url"`
	Author              string                    `xml:"ap:Author"`
	DocumentDescription verificationReportOptions `xml:"ap:DocumentDescription"`
}

type verificationReportOptions struct {
	Author      string `xml:"ap:Author,omitempty"`
	Work        string `xml:"ap:Work,omitempty"`
	ShortReport bool   `xml:"ap:ShortReport"`
}

type uploadOptions struct {
	AddToIndex bool   `xml:"ap:AddToIndex"`
	IndexState string `xml:"ap:IndexState,omitempty"`
}

type uploadDocumentResponse struct {
	Result uploadResult `xml:"UploadDocumentResult"`
}

type uploadResult struct {
	Uploaded []fileStatus `xml:"Uploaded"`
}

type fileStatus struct {
	ID          *documentIDValue `xml:"Id"`
	FileName    string           `xml:"FileName"`
	Reason      string           `xml:"Reason"`
	FailDetails *string          `xml:"FailDetails"`
}

type documentIDValue struct {
	ID       int     `xml:"Id"`
	External *string `xml:"External"`
}

type checkDocumentRequest struct {
	XMLName       xml.Name      `xml:"ap:CheckDocument"`
	DocumentID    documentIDRef `xml:"ap:docId"`
	CheckServices []string      `xml:"ap:checkServicesList,omitempty"`
}

type documentIDRef struct {
	ID int `xml:"ap:Id"`
}

type checkDocumentResponse struct{}

type getCheckStatusRequest struct {
	XMLName    xml.Name      `xml:"ap:GetCheckStatus"`
	DocumentID documentIDRef `xml:"ap:docId"`
}

type getCheckStatusResponse struct {
	Result getCheckStatusResult `xml:"GetCheckStatusResult"`
}

type getCheckStatusResult struct {
	Status            string             `xml:"Status"`
	FailDetails       *string            `xml:"FailDetails"`
	EstimatedWaitTime *int               `xml:"EstimatedWaitTime"`
	Summary           *reportSummaryBody `xml:"Summary"`
}

type reportSummaryBody struct {
	ReportNum           int        `xml:"ReportNum"`
	Score               float64    `xml:"Score"`
	ReportWebID         string     `xml:"ReportWebId"`
	ReadonlyReportWebID string     `xml:"ReadonlyReportWebId"`
	ShortReportWebID    string     `xml:"ShortReportWebId"`
	DetailedScore       scoreParts `xml:"DetailedScore"`
	IsSuspicious        bool       `xml:"IsSuspicious"`
	SummaryReportWebID  string     `xml:"SummaryReportWebId"`
}

type scoreParts struct {
	Plagiarism float64 `xml:"Plagiarism"`
	Legal      float64 `xml:"Legal"`
	SelfCite   float64 `xml:"SelfCite"`
	Unknown    float64 `xml:"Unknown"`
}

type exportReportToPDFRequest struct {
	XMLName    xml.Name            `xml:"ap:ExportReportToPdf"`
	DocumentID documentIDRef       `xml:"ap:docId"`
	Options    exportReportOptions `xml:"ap:options"`
}

type exportReportOptions struct {
	ReportNum         int               `xml:"ap:ReportNum"`
	ShortReport       bool              `xml:"ap:ShortReport"`
	FormattingOptions formattingOptions `xml:"ap:FormattingOptions"`
}

func normalizeCheckServices(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func uploadIndexState(addToIndex bool) string {
	if addToIndex {
		return "Indexed"
	}
	return ""
}

type formattingOptions struct {
	Language string `xml:"ap:Language,omitempty"`
}

type exportReportToPDFResponse struct {
	Result exportReportInfo `xml:"ExportReportToPdfResult"`
}

type exportReportInfo struct {
	Status            string `xml:"Status"`
	DownloadLink      string `xml:"DownloadLink"`
	ReportNum         int    `xml:"ReportNum"`
	EstimatedWaitTime *int   `xml:"EstimatedWaitTime"`
}
